import { computeLockStates } from './graph.js';
import { getSessionUsername } from './auth.js';
import { normalizeTask, TASK_STATUSES } from './taskModel.js';
import { buildDependencyIndex } from './dependencyModel.js';
import { prerequisiteError, transitionError } from './dependencyRules.js';

function enforceDependencyRule(message) {
    if (!message) return;
    const error = new Error(message);
    error.name = 'TaskDependencyError';
    throw error;
}

function getStorageKey() {
    return `flowforge-board-${workspaceOwner}`;
}

function getLegacyStorageKey() {
    return `kanban-board-${workspaceOwner}`;
}

let state = {
    tasks: {},
    activities: []
};

let lockStates = {};
let dependencyIndex = buildDependencyIndex({});
let subscribers = [];
let undoStack = [];
let storageBlocked = false;
let pendingSnapshot = null;
let workspaceOwner = null;

function assertWorkspaceOwner() {
    if (!workspaceOwner || getSessionUsername() !== workspaceOwner) {
        throw storageError('Your account changed or signed out. Reload to open the current account’s workspace. No changes were saved.');
    }
}

function storageError(message) {
    const error = new Error(message);
    error.name = 'TaskStorageError';
    return error;
}

function parseSavedState(saved) {
    const raw = JSON.parse(saved);
    if (!raw || typeof raw !== 'object' || !raw.tasks || typeof raw.tasks !== 'object' || Array.isArray(raw.tasks)) {
        throw new Error('Invalid saved board');
    }
    return normalizeState(raw);
}

function normalizeState(raw) {
    const safe = raw && typeof raw === 'object' ? raw : {};
    const records = safe.tasks && typeof safe.tasks === 'object' && !Array.isArray(safe.tasks) ? safe.tasks : {};
    const tasks = Object.create(null);
    Object.entries(records).forEach(([id, task]) => {
        if (task && typeof task === 'object' && !Array.isArray(task)) tasks[id] = normalizeTask(task, id);
    });

    return {
        tasks,
        activities: Array.isArray(safe.activities) ? safe.activities : []
    };
}

function cloneState() {
    return JSON.parse(JSON.stringify(state));
}

function rememberForUndo() {
    assertWorkspaceOwner();
    if (storageBlocked) throw storageError('Saved tasks could not be loaded. Changes are paused to protect your data. Check browser storage and reload.');
    pendingSnapshot = { state: cloneState(), undo: [...undoStack] };
    undoStack.push(cloneState());
    if (undoStack.length > 20) undoStack.shift();
}

function addActivity(type, message, taskId = null) {
    state.activities.unshift({
        id: 'activity-' + Math.random().toString(36).slice(2, 10),
        type,
        message,
        taskId,
        createdAt: new Date().toISOString()
    });
    state.activities = state.activities.slice(0, 60);
}

export function subscribe(callback) {
    subscribers.push(callback);
    return () => { subscribers = subscribers.filter(item => item !== callback); };
}

function notify() {
    subscribers.forEach(callback => callback());
}

export function loadState() {
    workspaceOwner = getSessionUsername();
    state = { tasks: {}, activities: [] };
    lockStates = {};
    dependencyIndex = buildDependencyIndex({});
    undoStack = [];
    pendingSnapshot = null;
    storageBlocked = false;
    if (!workspaceOwner) {
        storageBlocked = true;
        throw storageError('Log in before loading a workspace.');
    }
    try {
        let saved = localStorage.getItem(getStorageKey());

        // One-time migration from the original Kanban project so existing tasks
        // are not lost after upgrading to FlowForge.
        if (!saved) {
            const legacy = localStorage.getItem(getLegacyStorageKey());
            if (legacy) {
                const migrated = parseSavedState(legacy);
                localStorage.setItem(getStorageKey(), JSON.stringify(migrated));
                saved = JSON.stringify(migrated);
            }
        }

        state = saved ? parseSavedState(saved) : { tasks: {}, activities: [] };
    } catch (error) {
        console.warn('Failed to load saved state.', error);
        state = { tasks: {}, activities: [] };
        storageBlocked = true;
    }
    recomputeLocks();
    if (storageBlocked) throw storageError('Saved tasks could not be loaded. Existing browser data is untouched. Check browser storage and reload before editing.');
}

function saveState() {
    try {
        assertWorkspaceOwner();
        localStorage.setItem(getStorageKey(), JSON.stringify(state));
    } catch {
        if (pendingSnapshot) {
            state = pendingSnapshot.state;
            undoStack = pendingSnapshot.undo;
        }
        pendingSnapshot = null;
        recomputeLocks();
        notify();
        throw storageError('Change not saved: browser storage may be full or disabled. Your previous board has been restored.');
    }
    pendingSnapshot = null;
    recomputeLocks();
    notify();
}

function recomputeLocks() {
    dependencyIndex = buildDependencyIndex(state.tasks);
    lockStates = computeLockStates(state.tasks);
}

export function getTaskDependencies(id) {
    return {
        prerequisites: [...(dependencyIndex.prerequisites.get(id) || [])],
        dependents: [...(dependencyIndex.dependents.get(id) || [])],
        missing: [...(dependencyIndex.missing.get(id) || [])]
    };
}

export function getTasks() {
    return state.tasks;
}

export function getTask(id) {
    return state.tasks[id];
}

export function getActivities() {
    return state.activities;
}

export function getLockState(id) {
    return lockStates[id] || { locked: false, blockingDeps: [] };
}

export function generateId() {
    return 'task-' + crypto.randomUUID();
}

export function addTask(taskData) {
    rememberForUndo();
    const id = generateId();
    const task = {
        id,
        title: taskData.title,
        description: taskData.description || '',
        status: 'todo',
        priority: taskData.priority || 'medium',
        category: taskData.category || 'General',
        dueDate: taskData.dueDate || '',
        tags: Array.isArray(taskData.tags) ? taskData.tags : [],
        dependsOn: Array.isArray(taskData.dependsOn) ? taskData.dependsOn : [],
        createdAt: new Date().toISOString()
    };
    state.tasks[id] = normalizeTask(task, id);
    addActivity('create', `Created “${task.title}”`, id);
    saveState();
    return id;
}

export function updateTask(id, taskData) {
    const task = state.tasks[id];
    if (!task) return;
    enforceDependencyRule(prerequisiteError(state.tasks, { ...task, dependsOn: taskData.dependsOn ?? task.dependsOn }));
    rememberForUndo();
    Object.assign(task, normalizeTask({
        ...task,
        title: taskData.title ?? task.title,
        description: taskData.description ?? task.description,
        priority: taskData.priority ?? task.priority,
        category: taskData.category ?? task.category,
        dueDate: taskData.dueDate ?? task.dueDate,
        tags: taskData.tags ?? task.tags,
        dependsOn: taskData.dependsOn ?? task.dependsOn
    }, id));
    addActivity('edit', `Updated “${task.title}”`, id);
    saveState();
}

export function updateTaskStatus(id, newStatus) {
    const task = state.tasks[id];
    if (!task || task.status === newStatus || !TASK_STATUSES.includes(newStatus)) return;
    enforceDependencyRule(transitionError(state.tasks, id, newStatus));
    rememberForUndo();
    const oldStatus = task.status;
    task.status = newStatus;
    const names = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };
    addActivity('move', `Moved “${task.title}” from ${names[oldStatus]} to ${names[newStatus]}`, id);
    saveState();
}

export function deleteTask(id) {
    const task = state.tasks[id];
    if (!task) return;
    rememberForUndo();
    delete state.tasks[id];

    for (const taskId in state.tasks) {
        const other = state.tasks[taskId];
        other.dependsOn = (other.dependsOn || []).filter(depId => depId !== id);
    }

    addActivity('delete', `Deleted “${task.title}”`);
    saveState();
}

export function importTasks(items) {
    if (!Array.isArray(items) || items.length === 0) return 0;
    rememberForUndo();
    let count = 0;

    items.forEach(item => {
        if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim()) return;
        const id = generateId();
        state.tasks[id] = normalizeTask({
            id,
            title: item.title,
            description: item.description || 'Imported from College Task Library',
            status: item.status || 'todo',
            priority: item.priority || 'medium',
            category: item.category || 'College',
            dueDate: item.dueDate || '',
            tags: Array.isArray(item.tags) ? item.tags : ['College'],
            dependsOn: [],
            createdAt: new Date().toISOString()
        }, id);
        count += 1;
    });

    addActivity('import', `Imported ${count} college task${count === 1 ? '' : 's'} from College Task Library`);
    saveState();
    return count;
}

export function resetBoard() {
    rememberForUndo();
    state = { tasks: {}, activities: [] };
    saveState();
}

export function undoLastAction() {
    assertWorkspaceOwner();
    if (undoStack.length === 0) return false;
    if (storageBlocked) throw storageError('Reload your saved board before using Undo.');
    pendingSnapshot = { state: cloneState(), undo: [...undoStack] };
    state = normalizeState(undoStack.pop());
    saveState();
    return true;
}

export function canUndo() {
    return undoStack.length > 0;
}
