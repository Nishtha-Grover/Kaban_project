export function prerequisiteError(tasks, task) {
    if (task.status === 'todo') return null;
    const pending = (task.dependsOn || []).filter(id => !Object.hasOwn(tasks, id) || tasks[id].status !== 'done');
    return pending.length ? `Finish prerequisites first: ${pending.map(id => Object.hasOwn(tasks, id) ? tasks[id].title : 'Missing task').join(', ')}.` : null;
}

export function transitionError(tasks, id, status) {
    const task = tasks[id];
    if (!task) return 'This task no longer exists.';
    if (!['todo', 'inprogress', 'done'].includes(status)) return 'Invalid task status.';
    const blocked = prerequisiteError(tasks, { ...task, status });
    if (blocked) return blocked;
    if (task.status === 'done' && status !== 'done') {
        const active = Object.values(tasks).filter(other => other.id !== id && other.status !== 'todo' && other.dependsOn?.includes(id));
        if (active.length) return `Move dependent tasks back to To do before reopening this prerequisite: ${active.map(other => other.title).join(', ')}.`;
    }
    return null;
}
