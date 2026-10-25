export const TASK_STATUSES = Object.freeze(['todo', 'inprogress', 'done']);
export const TASK_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

const text = value => typeof value === 'string' ? value.trim() : '';
const strings = value => Array.isArray(value)
    ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : [];

export function normalizeTask(input, id) {
    const task = input && typeof input === 'object' ? input : {};
    return {
        id,
        title: text(task.title) || 'Untitled task',
        description: text(task.description),
        status: TASK_STATUSES.includes(task.status) ? task.status : 'todo',
        priority: TASK_PRIORITIES.includes(task.priority) ? task.priority : 'medium',
        category: text(task.category) || 'General',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(text(task.dueDate)) &&
            !Number.isNaN(Date.parse(task.dueDate)) &&
            new Date(task.dueDate).toISOString().slice(0, 10) === task.dueDate ? task.dueDate : '',
        tags: strings(task.tags),
        dependsOn: strings(task.dependsOn),
        createdAt: typeof task.createdAt === 'string' && !Number.isNaN(Date.parse(task.createdAt))
            ? task.createdAt : new Date().toISOString()
    };
}
