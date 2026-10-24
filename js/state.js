import { computeLockStates } from './graph.js';
import { getWorkspaceIdentity } from './auth.js';
import { buildDependencyIndex } from './dependencyModel.js';
import { loadDatabaseTasks, createDatabaseTask, updateDatabaseTask, deleteDatabaseTask } from './taskApi.js';
import { requestJson } from './httpClient.js';

let state = { tasks: Object.create(null), activities: [] };
let locks = {}, index = buildDependencyIndex({}), owner = null;
let ready = false, busy = false;
const subscribers = new Set();
export function subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); }
function notify() { for (const callback of subscribers) callback(); }
function assertOwner() {
    if (!owner || owner !== getWorkspaceIdentity()) throw new Error('Your session changed. Reload before editing.');
}
async function readBoard() {
    const [tasks, activity] = await Promise.all([
        loadDatabaseTasks(),
        requestJson('/api/studio/collections/activities?limit=50', { label: 'Load activity' })
    ]);
    assertOwner();
    state = {
        tasks: Object.fromEntries(tasks.map(task => [task.id, task])),
        activities: activity.documents.map(item => ({ id: item._id, type: item.action,
            message: item.message, taskId: item.task, createdAt: item.createdAt }))
    };
    locks = computeLockStates(state.tasks);
    index = buildDependencyIndex(state.tasks);
}
export async function loadState() {
    if (busy) throw new Error('Wait for the current save to finish.');
    busy = true; ready = false;
    owner = getWorkspaceIdentity();
    state = { tasks: Object.create(null), activities: [] };
    locks = {}; index = buildDependencyIndex({});
    try { assertOwner(); await readBoard(); ready = true; }
    finally { busy = false; notify(); }
}
async function mutate(action) {
    assertOwner();
    if (!ready) throw new Error('Reload the board before editing. A previous request may have saved on the server.');
    if (busy) throw new Error('A task is being saved. Wait a moment before changing another task.');
    busy = true;
    try {
        const result = await action();
        assertOwner();
        await readBoard();
        notify();
        return result;
    } catch (error) {
        // Do not retry writes: a lost response may follow a successful commit.
        ready = false;
        error.message += ' Reload the board to check its latest saved state before trying again.';
        throw error;
    } finally { busy = false; }
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
        let count = 0;
        try {
            for (const item of items) {
                await createDatabaseTask({ ...item, dependsOn: [] });
                count++;
            }
            return count;
        } catch (error) {
            error.message = `${count} imports confirmed. The last request may also have saved. ${error.message}`;
            throw error;
        }
    });
}
// Database undo/reset require transactional operations, not local snapshots.
export function resetBoard() { throw new Error('Database reset is not available yet.'); }
export function undoLastAction() { return false; }
export function canUndo() { return false; }
export function getUndoInfo() { return { count: 0, label: 'Database undo is not available yet' }; }
