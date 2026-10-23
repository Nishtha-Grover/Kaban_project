import { createTask, updateTask, deleteTask } from './tasks.js';

// Called only inside runWorkspaceTransaction: failure to write history aborts
// the task mutation as well. Do not accept audit text or owners from clients.
export async function mutateTaskWithAudit(action, owner, id, input, context, {
    create = createTask, update = updateTask, remove = deleteTask
} = {}) {
    if (!['create', 'update', 'delete'].includes(action)) throw new Error('Unknown task mutation.');
    if (typeof context.recordActivity !== 'function') throw new Error('Transactional audit writer required.');
    let before;
    if (action !== 'create') {
        if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) {
            throw Object.assign(new Error('A valid task ID is required.'), { status: 400, code: 'TASK_VALIDATION' });
        }
        before = await context.tasks.findOne({ _id: id, owner });
        // The mutation service performs ID/version validation and reports missing tasks.
        if (before) before = { title: before.title, status: before.status };
    }
    const result = action === 'create' ? await create(owner, input, context)
        : action === 'update' ? await update(owner, id, input, context)
            : await remove(owner, id, input, context);
    const moved = action === 'update' && before.status !== result.status;
    const title = result?.title ?? before.title;
    const message = action === 'create' ? `Created task: ${title}`
        : action === 'delete' ? `Deleted task: ${title}`
            : moved ? `Moved task: ${title} (${before.status} → ${result.status})`
                : `Updated task: ${title}`;
    await context.recordActivity({ task: result?.id ?? id,
        action: moved ? 'move' : action === 'update' ? 'edit' : action, message });
    return result;
}
