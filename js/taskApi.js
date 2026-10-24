import { requestJson } from './httpClient.js';

const fields = ['title', 'description', 'priority', 'category', 'dueDate', 'tags', 'dependsOn'];
function payload(task, update = false) {
    return Object.fromEntries([...fields, ...(update ? ['status'] : [])]
        .filter(key => task[key] !== undefined).map(key => [key, task[key]]));
}
function target(task) {
    if (!/^[a-f0-9]{24}$/i.test(task?.id || '') || !Number.isSafeInteger(task.version) || task.version < 0) {
        throw new Error('Reload this task before changing it; its database ID or version is missing.');
    }
    return `/api/tasks/${task.id}`;
}

export async function loadDatabaseTasks() {
    const tasks = new Map();
    // Build a complete result before handing it to the board: failures never
    // replace the displayed board with a partially downloaded task list.
    for (let page = 1; page <= 1000; page++) {
        const result = await requestJson(`/api/tasks?page=${page}&limit=100`, { label: 'Load tasks' });
        if (!Array.isArray(result?.tasks) || result.page !== page || !Number.isSafeInteger(result.totalPages)) {
            throw new Error('The server returned an invalid task list. Reload before editing.');
        }
        for (const task of result.tasks) { target(task); tasks.set(task.id, task); }
        if (page >= result.totalPages) return [...tasks.values()];
    }
    throw new Error('This workspace is too large to load completely. No partial board was loaded.');
}

export async function createDatabaseTask(task) {
    const result = await requestJson('/api/tasks', { method: 'POST', json: payload(task), label: 'Create task' });
    target(result.task);
    return result.task;
}
export async function updateDatabaseTask(task, changes) {
    const result = await requestJson(target(task), {
        method: 'PATCH', json: { ...payload(changes, true), version: task.version }, label: 'Save task'
    });
    target(result.task);
    return result.task;
}
export async function deleteDatabaseTask(task) {
    await requestJson(target(task), { method: 'DELETE', json: { version: task.version }, label: 'Delete task' });
}
