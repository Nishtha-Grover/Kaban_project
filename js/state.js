import { computeLockStates } from './graph.js';
import { getWorkspaceIdentity } from './auth.js';
import { buildDependencyIndex } from './dependencyModel.js';
import { loadDatabaseTasks, createDatabaseTask, updateDatabaseTask, deleteDatabaseTask } from './taskApi.js';
import { requestJson } from './httpClient.js';

let state = { tasks: Object.create(null), activities: [] };
let locks = {}, index = buildDependencyIndex({}), owner = null;
let ready = false, busy = false;
let history = { revision: 0, canUndo: false, label: '' };
const subscribers = new Set();
export function subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); }
function notify() { for (const callback of subscribers) callback(); }
function assertOwner() {
    if (!owner || owner !== getWorkspaceIdentity()) throw new Error('Your session changed. Reload before editing.');
}
async function readBoard(attempt = 0) {
    const before = await requestJson('/api/tasks/history', { label: 'Load board revision' });
    const [tasks, activity] = await Promise.all([
        loadDatabaseTasks(),
        requestJson('/api/studio/collections/activities?limit=50', { label: 'Load activity' })
    ]);
    const after = await requestJson('/api/tasks/history', { label: 'Load board history' });
    if (before.revision !== after.revision) {
        if (attempt < 2) return readBoard(attempt + 1);
        throw new Error('The board is changing in another tab. Wait a moment and reload.');
    }
    assertOwner();
    history = after;
    state = {
        tasks: Object.fromEntries(tasks.map(task => [task.id, task])),
        activities: activity.documents.map(item => ({ id: item._id, type: item.action,
            message: item.message, taskId: item.task, createdAt: item.createdAt }))
    };
    locks = computeLockStates(state.tasks);
    index = buildDependencyIndex(state.tasks);
}
// Retry only reads: retrying a write after a lost response could duplicate it.
async function syncBoard() {
    for (let attempt = 0; ; attempt++) {
        try { await readBoard(); return; }
        catch (error) {
            const transient = ['NETWORK', 'TIMEOUT', 'PARSE'].includes(error.code)
                || [429, 500, 502, 503, 504].includes(error.status);
            if (!transient || attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
    }
}
export async function loadState() {
    if (busy) throw new Error('Wait for the current save to finish.');
    busy = true; ready = false;
    history = { revision: 0, canUndo: false, label: '' };
    owner = getWorkspaceIdentity();
    state = { tasks: Object.create(null), activities: [] };
    locks = {}; index = buildDependencyIndex({});
    try { assertOwner(); await syncBoard(); ready = true; }
    finally { busy = false; notify(); }
}
async function mutate(action) {
    assertOwner();
    if (busy) throw new Error('A task is being saved. Wait a moment before changing another task.');
    busy = true;
    let saved = false, result;
    try {
        // Recover an interrupted synchronization before accepting another edit.
        if (!ready) { await syncBoard(); ready = true; }
        result = await action();
        saved = true;
        assertOwner();
        await syncBoard();
        ready = true;
    } catch (error) {
        ready = false;
        try {
            await syncBoard();
            ready = true;
        } catch {
            error.message = saved
                ? 'Your change was saved, but the connection interrupted the board update. Try again when the connection returns.'
                : 'Could not confirm this change. The board will synchronize before your next edit; check its saved state before repeating the action.';
            throw error;
        }
        // A confirmed save followed by a failed read is still a successful save.
        if (!saved) {
            if (!error.status || error.status >= 500) {
                error.message = 'The save response was interrupted. The latest board is now synchronized; check whether your change appears before repeating it.';
            }
            throw error;
        }
    } finally {
        busy = false;
        notify();
    }
    return result;
}
function taskAt(id) {
    const task = state.tasks[id];
    if (!task) throw new Error('This task is unavailable. Reload the board.');
    return task;
}
export function getTasks() { return state.tasks; }
export function getTask(id) { return state.tasks[id]; }
export function getActivities() { return state.activities; }
export function getLockState(id) { return locks[id] || { locked: false, blockingDeps: [] }; }
export function getTaskDependencies(id) {
    return { prerequisites: [...(index.prerequisites.get(id) || [])],
        dependents: [...(index.dependents.get(id) || [])], missing: [...(index.missing.get(id) || [])] };
}
export async function addTask(data) { return mutate(async () => (await createDatabaseTask(data)).id); }
export async function updateTask(id, data) { return mutate(() => updateDatabaseTask(taskAt(id), data)); }
export async function updateTaskStatus(id, status) { return updateTask(id, { status }); }
export async function deleteTask(id) { return mutate(() => deleteDatabaseTask(taskAt(id))); }
export async function importTasks(items) {
    return mutate(async () => {
        const fields = ['title', 'description', 'priority', 'category', 'dueDate', 'tags'];
        const tasks = items.map(item => ({ ...Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key, item[key]])), dependsOn: [] }));
        return (await requestJson('/api/tasks/import-library', { method: 'POST', json: { tasks }, label: 'Import library', timeoutMs: 30000 })).imported;
    });
}
export async function resetBoard() {
    return mutate(() => requestJson('/api/tasks/reset', { method: 'POST', json: { revision: history.revision }, label: 'Reset board', timeoutMs: 30000 }));
}
export async function undoLastAction() {
    if (!canUndo()) return false;
    await mutate(() => requestJson('/api/tasks/undo', { method: 'POST', json: { revision: history.revision }, label: 'Undo action', timeoutMs: 30000 }));
    return true;
}
export function canUndo() { return ready && history.canUndo; }
export function getUndoInfo() { return { count: canUndo() ? 1 : 0, label: history.label || 'Nothing to undo' }; }
