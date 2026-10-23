export function calculateMetrics(tasks, getLockState) {
    const metrics = { total: 0, todo: 0, inprogress: 0, done: 0, blocked: 0, ready: 0, progress: 0 };
    for (const task of tasks) {
        metrics.total += 1;
        if (['todo', 'inprogress', 'done'].includes(task.status)) metrics[task.status] += 1;
        if (task.status !== 'done' && getLockState(task.id).locked) metrics.blocked += 1;
        else if (task.status === 'todo') metrics.ready += 1;
    }
    metrics.progress = metrics.total ? Math.round(metrics.done / metrics.total * 100) : 0;
    return metrics;
}
