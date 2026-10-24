import { createHash } from 'node:crypto';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { validateTaskInput } from './taskValidation.js';
import { validateDependencyGraph } from './dependencies.js';

function invalid(message) { return Object.assign(new Error(message), { status: 400, code: 'MIGRATION_INVALID' }); }
export async function migrateTasks(owner, input, context) {
    if (!input || Object.keys(input).some(key => key !== 'tasks') || !Array.isArray(input.tasks)
        || !input.tasks.length || input.tasks.length > 100) throw invalid('Import between 1 and 100 tasks at a time.');
    const ids = new Map(), prepared = [];
    for (const record of input.tasks) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw invalid('Invalid task record.');
        const { legacyId, ...data } = record;
        if (typeof legacyId !== 'string' || !legacyId.length || legacyId.length > 200 || ids.has(legacyId)) throw invalid('Old task IDs must be unique and nonempty.');
        if (!Array.isArray(data.dependsOn) || data.dependsOn.some(id => typeof id !== 'string')) throw invalid('Task dependencies must be a list of IDs.');
        if (!['todo', 'inprogress', 'done'].includes(data.status)) throw invalid('Invalid task status.');
        validateTaskInput({ ...data, status: 'todo', dependsOn: [] });
        const task = new Task({ ...data, dependsOn: [], owner });
        try { await task.validate(); } catch { throw invalid(`Invalid fields in task: ${String(data.title || legacyId).slice(0, 160)}`); }
        ids.set(legacyId, String(task._id));
        prepared.push({ legacyId, task, dependencies: data.dependsOn });
    }
    for (const item of prepared) {
        if (item.dependencies.some(id => !ids.has(id))) throw invalid('A prerequisite is missing from this backup. Nothing was imported.');
        item.task.dependsOn = item.dependencies.map(id => ids.get(id));
    }
    const rows = prepared.map(item => item.task);
    for (const item of prepared) {
        validateDependencyGraph(rows, String(item.task._id), item.task.dependsOn.map(String));
        if (item.task.status !== 'todo' && item.dependencies.some(id => prepared.find(row => row.legacyId === id).task.status !== 'done')) {
            throw invalid('An active or completed task has unfinished prerequisites. Correct the backup before importing.');
        }
    }
    // Hash normalized, ordered fields and old IDs, never the newly generated IDs.
    const canonical = prepared.map(({ legacyId, task, dependencies }) => ({ legacyId, title: task.title,
        description: task.description, status: task.status, priority: task.priority, category: task.category,
        dueDate: task.dueDate, tags: [...task.tags].sort(), dependsOn: [...dependencies].sort() }))
        .sort((a, b) => a.legacyId.localeCompare(b.legacyId));
    const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    const user = await User.findById(owner).select('+migrationHashes').session(context.session);
    if (user.migrationHashes.includes(hash)) return { imported: 0, alreadyImported: true };
    if (user.migrationHashes.length >= 50) throw invalid('This account has reached the limit of 50 distinct backup imports.');
    for (const { task } of prepared) await context.saveTask(task);
    await User.updateOne({ _id: owner }, { $push: { migrationHashes: hash } }, { session: context.session });
    await context.recordActivity({ task: null, action: 'import', message: `Imported ${prepared.length} tasks from a browser backup` });
    return { imported: prepared.length, alreadyImported: false };
}
