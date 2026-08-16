import { computeLockStates } from './graph.js';
import { getSessionUsername } from './auth.js';

function getStorageKey() {
    const session = getSessionUsername();
    return session ? `flowforge-board-${session}` : 'flowforge-board-anonymous';
}

function getLegacyStorageKey() {
    const session = getSessionUsername();
    return session ? `kanban-board-${session}` : 'kanban-board-anonymous';
}

let state = {
    tasks: {},
    activities: []
};

let lockStates = {};
let subscribers = [];
let undoStack = [];

function normalizeState(raw) {
    const safe = raw && typeof raw === 'object' ? raw : {};
    const tasks = safe.tasks && typeof safe.tasks === 'object' ? safe.tasks : {};

    Object.values(tasks).forEach(task => {
        task.priority = task.priority || 'medium';
        task.category = task.category || 'General';
        task.dueDate = task.dueDate || '';
        task.tags = Array.isArray(task.tags) ? task.tags : [];
        task.dependsOn = Array.isArray(task.dependsOn) ? task.dependsOn : [];
        task.status = task.status || 'todo';
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
}

function notify() {
    subscribers.forEach(callback => callback());
}

export function loadState() {
    try {
        let saved = localStorage.getItem(getStorageKey());

        // One-time migration from the original Kanban project so existing tasks
        // are not lost after upgrading to FlowForge.
        if (!saved) {
            const legacy = localStorage.getItem(getLegacyStorageKey());
            if (legacy) {
                const migrated = normalizeState(JSON.parse(legacy));
                localStorage.setItem(getStorageKey(), JSON.stringify(migrated));
                saved = JSON.stringify(migrated);
            }
        }

        state = saved ? normalizeState(JSON.parse(saved)) : { tasks: {}, activities: [] };
    } catch (error) {
        console.warn('Failed to load saved state.', error);
        state = { tasks: {}, activities: [] };
    }
    recomputeLocks();
}

function saveState() {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
    recomputeLocks();
    notify();
}

function recomputeLocks() {
    lockStates = computeLockStates(state.tasks);
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
    return 'task-' + Math.random().toString(36).slice(2, 11);
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
    state.tasks[id] = task;
    addActivity('create', `Created “${task.title}”`, id);
    saveState();
    return id;
}

export function updateTask(id, taskData) {
    const task = state.tasks[id];
    if (!task) return;
    rememberForUndo();
    Object.assign(task, {
        title: taskData.title,
        description: taskData.description || '',
        priority: taskData.priority || 'medium',
        category: taskData.category || 'General',
        dueDate: taskData.dueDate || '',
        tags: Array.isArray(taskData.tags) ? taskData.tags : [],
        dependsOn: Array.isArray(taskData.dependsOn) ? taskData.dependsOn : []
    });
    addActivity('edit', `Updated “${task.title}”`, id);
    saveState();
}

export function updateTaskStatus(id, newStatus) {
    const task = state.tasks[id];
    if (!task || task.status === newStatus) return;
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
        const id = generateId();
        state.tasks[id] = {
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
        };
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
    if (undoStack.length === 0) return false;
    state = normalizeState(undoStack.pop());
    saveState();
    return true;
}

export function canUndo() {
    return undoStack.length > 0;
}
