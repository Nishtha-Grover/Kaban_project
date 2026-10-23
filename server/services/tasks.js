import { Task } from '../models/Task.js';

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
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Provide a task JSON object.');
    const allowed = ['title', 'description', 'status', 'priority', 'category', 'dueDate', 'tags', 'dependsOn'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw invalid('Task contains unsupported fields.');
    for (const field of ['title', 'description', 'status', 'priority', 'category', 'dueDate']) {
        if (input[field] !== undefined && typeof input[field] !== 'string') throw invalid(`${field} must be text.`);
    }
    if (input.status !== undefined && input.status !== 'todo') throw invalid('New tasks must start in To do.');
    for (const field of ['tags', 'dependsOn']) {
        if (input[field] !== undefined && (!Array.isArray(input[field]) || input[field].some(value => typeof value !== 'string'))) {
            throw invalid(`${field} must be an array of strings.`);
        }
    }
    if (input.dependsOn?.some(id => !/^[a-f0-9]{24}$/i.test(id))) throw invalid('Dependencies must be valid task IDs.');
    if ((input.dependsOn?.length || 0) > 100) throw invalid('Use at most 100 prerequisites per task.');
    const task = new Task({ ...input, owner, status: 'todo' });
    try { await task.validate(); }
    catch (error) {
        if (error.name === 'ValidationError') throw invalid(Object.values(error.errors).map(item => item.message).join(' '));
        throw error;
    }
    if (task.dependsOn.length) {
        const found = await countDependencies({ owner, _id: { $in: task.dependsOn } });
        if (found !== task.dependsOn.length) throw invalid('One or more prerequisites are unavailable in your workspace.');
    }
    return taskResponse(await saveTask(task));
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
