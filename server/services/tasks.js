import { Task } from '../models/Task.js';
import { Attachment } from '../models/Attachment.js';
import { validateTaskInput, mapTaskValidation } from './taskValidation.js';
import { validateDependencyGraph } from './dependencies.js';
import { enforcePrerequisites } from './prerequisites.js';

function conflict(message) {
    return Object.assign(new Error(message), { status: 409, code: 'TASK_CONFLICT' });
}

function validTarget(id, version) {
    if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw invalid('A valid task ID is required.');
    if (!Number.isSafeInteger(version) || version < 0) throw invalid('Provide the task version from your latest task list.');
}

async function ownedTask(tasks, owner, id, version) {
    const task = await tasks.findOne({ _id: id, owner });
    if (!task) throw Object.assign(new Error('Task not found.'), { status: 404, code: 'TASK_NOT_FOUND' });
    if (task.__v !== version) throw conflict('This task has changed. Reload it before trying again.');
    return task;
}

export async function updateTask(owner, id, input, { tasks = Task, saveTask = task => task.save() } = {}) {
    validateTaskInput(input, { update: true });
    validTarget(id, input.version);
    const fields = ['title', 'description', 'priority', 'category', 'dueDate', 'tags', 'status', 'dependsOn'];
    const changes = Object.fromEntries(Object.entries(input).filter(([key]) => fields.includes(key)));
    const task = await ownedTask(tasks, owner, id, input.version);
    if (changes.dependsOn !== undefined) {
        const graph = await tasks.find({ owner }).select('_id dependsOn').lean();
        changes.dependsOn = validateDependencyGraph(graph, id, changes.dependsOn);
    }
    await enforcePrerequisites(tasks, owner, task, changes);
    task.set(changes);
    try { return taskResponse(await saveTask(task)); }
    catch (error) {
        if (error.name === 'ValidationError') throw mapTaskValidation(error);
        if (error.name === 'VersionError' || error.name === 'DocumentNotFoundError') throw conflict('This task changed while saving. Reload and retry.');
        throw error;
    }
}

export async function deleteTask(owner, id, input, { tasks = Task, attachments = Attachment } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'version')) throw invalid('Provide only the task version.');
    validTarget(id, input.version);
    await ownedTask(tasks, owner, id, input.version);
    if (await tasks.exists({ owner, dependsOn: id })) throw conflict('Remove dependent task links before deleting this task.');
    if (await attachments.exists({ owner, task: id })) throw conflict('Remove task attachments before deleting this task.');
    const result = await tasks.deleteOne({ _id: id, owner, __v: input.version });
    if (result.deletedCount !== 1) throw conflict('This task changed while deleting. Reload and retry.');
}

function invalid(message) {
    return Object.assign(new Error(message), { status: 400, code: 'TASK_VALIDATION' });
}

export function taskResponse(task) {
    return {
        id: String(task._id), title: task.title, description: task.description,
        status: task.status, priority: task.priority, category: task.category,
        dueDate: task.dueDate, tags: [...task.tags],
        dependsOn: task.dependsOn.map(String), createdAt: task.createdAt,
        updatedAt: task.updatedAt, version: task.__v ?? 0
    };
}

export async function createTask(owner, input, {
    countDependencies = filter => Task.countDocuments(filter),
    saveTask = task => task.save()
} = {}) {
    validateTaskInput(input);
    const task = new Task({ ...input, owner, status: 'todo' });
    try { await task.validate(); }
    catch (error) {
        if (error.name === 'ValidationError') throw mapTaskValidation(error);
        throw error;
    }
    if (task.dependsOn.length) {
        const found = await countDependencies({ owner, _id: { $in: task.dependsOn } });
        if (found !== task.dependsOn.length) throw invalid('One or more prerequisites are unavailable in your workspace.');
    }
    try { return taskResponse(await saveTask(task)); }
    catch (error) { throw mapTaskValidation(error); }
}

export async function listTasks(owner, query = {}, { tasks = Task } = {}) {
    if (Object.keys(query).some(key => !['page', 'limit', 'status'].includes(key))) throw invalid('Unsupported task query.');
    const integer = (value, fallback, max) => {
        if (value === undefined) return fallback;
        if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw invalid('Invalid pagination value.');
        return Number(value);
    };
    const page = integer(query.page, 1, 100000);
    const limit = integer(query.limit, 20, 100);
    const filter = { owner };
    if (query.status !== undefined) {
        if (!['todo', 'inprogress', 'done'].includes(query.status)) throw invalid('Invalid task status filter.');
        filter.status = query.status;
    }
    const [rows, total] = await Promise.all([
        tasks.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        tasks.countDocuments(filter)
    ]);
    return { tasks: rows.map(taskResponse), page, limit, total, totalPages: Math.ceil(total / limit) };
}
