import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { mutateTaskWithAudit } from './taskAudit.js';

const MAX_UNDO_TASKS = 500;
function conflict(message) { return Object.assign(new Error(message), { status: 409, code: 'TASK_CONFLICT' }); }
export async function boardHistory(owner) {
    const user = await User.findById(owner).select('+workspaceRevision +boardUndo').lean();
    const valid = Boolean(user?.boardUndo && user.boardUndo.revision === user.workspaceRevision);
    return { revision: user?.workspaceRevision ?? 0, canUndo: valid, label: valid ? user.boardUndo.label : '' };
}
export async function rememberBoard(owner, context, label, work) {
    const before = await context.tasks.find({ owner }).limit(MAX_UNDO_TASKS + 1).lean();
    const result = await work();
    const user = await User.findById(owner).select('+workspaceRevision').session(context.session);
    await User.updateOne({ _id: owner }, { $set: { boardUndo: before.length <= MAX_UNDO_TASKS
        ? { revision: user.workspaceRevision, label, tasks: before } : null } }, { session: context.session });
    return result;
}
async function requireRevision(owner, input, context) {
    if (!input || Object.keys(input).length !== 1 || !Number.isSafeInteger(input.revision) || input.revision < 0) {
        throw conflict('Reload the board to obtain its current revision.');
    }
    const user = await User.findById(owner).select('+workspaceRevision +boardUndo').session(context.session);
    // The shared transaction lock increments the revision before this check.
    if (user.workspaceRevision !== input.revision + 1) throw conflict('The workspace changed. Reload before continuing.');
    return user;
}
export async function undoBoard(owner, input, context) {
    const user = await requireRevision(owner, input, context), snapshot = user.boardUndo;
    if (!snapshot || snapshot.revision !== input.revision) throw conflict('There is no current action to undo.');
    const current = await context.tasks.find({ owner }).lean();
    const versions = new Map(current.map(task => [String(task._id), task.__v || 0]));
    // Only server-created snapshots are used. Keep task IDs so attachment and
    // dependency references remain stable; increment versions against stale tabs.
    await Task.deleteMany({ owner }).session(context.session);
    for (const row of snapshot.tasks) {
        const version = Math.max(row.__v || 0, versions.get(String(row._id)) ?? 0) + 1;
        const restored = new Task({ ...row, owner,
            updatedAt: new Date() });
        await restored.save({ session: context.session, timestamps: false });
        // Mongoose initializes __v on insert. Set the monotonic restored version
        // explicitly within the same transaction before exposing the snapshot.
        await Task.updateOne({ _id: row._id, owner }, { $set: { __v: version } }, { session: context.session, timestamps: false });
    }
    await User.updateOne({ _id: owner }, { $set: { boardUndo: null } }, { session: context.session });
    await context.recordActivity({ task: null, action: 'undo', message: `Undid: ${snapshot.label}` });
    return { undone: true };
}
export async function resetDatabaseBoard(owner, input, context) {
    await requireRevision(owner, input, context);
    if (await context.attachments.exists({ owner })) throw conflict('Remove task attachments before resetting the board.');
    if (await context.tasks.countDocuments({ owner }) > MAX_UNDO_TASKS) throw conflict('Reset supports up to 500 tasks so it can be undone safely.');
    return rememberBoard(owner, context, 'Reset board', async () => {
        const result = await Task.deleteMany({ owner }).session(context.session);
        await context.recordActivity({ task: null, action: 'delete', message: `Reset board: removed ${result.deletedCount} tasks` });
        return { removed: result.deletedCount };
    });
}
export async function importLibraryBatch(owner, input, context) {
    if (!input || Object.keys(input).some(key => key !== 'tasks') || !Array.isArray(input.tasks)
        || !input.tasks.length || input.tasks.length > 100) throw conflict('Choose between 1 and 100 library tasks.');
    return rememberBoard(owner, context, `Import ${input.tasks.length} library tasks`, async () => {
        for (const task of input.tasks) await mutateTaskWithAudit('create', owner, null, task, context);
        return { imported: input.tasks.length };
    });
}
