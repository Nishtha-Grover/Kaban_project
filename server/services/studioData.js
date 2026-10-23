import { mutateTaskWithAudit } from './taskAudit.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';
import { Attachment } from '../models/Attachment.js';

export async function seedDemo(owner, context, { mutate = mutateTaskWithAudit } = {}) {
    if (!await context.claimDemoSeed()) return { created: 0, alreadySeeded: true };
    const definitions = [
        ['Plan the college showcase', 'high', []],
        ['Build the project prototype', 'high', [0]],
        ['Prepare the demo presentation', 'medium', [0]],
        ['Review and present the project', 'urgent', [1, 2]]
    ];
    const tasks = [];
    for (const [title, priority, prerequisites] of definitions) {
        tasks.push(await mutate('create', owner, null, { title, priority,
            category: 'College showcase demo', tags: ['demo', 'college'],
            description: 'Demo project task. Edit this task or use it to explore dependencies and database relationships.',
            dependsOn: prerequisites.map(index => tasks[index].id)
        }, context));
    }
    return { created: tasks.length, alreadySeeded: false, taskIds: tasks.map(task => task.id) };
}

export const EXPORT_LIMIT = 1000;
export async function exportWorkspace(owner, context, {
    users = User, tasks = Task, activities = Activity, attachments = Attachment
} = {}) {
    const definitions = [
        ['users', users, { _id: owner }, '_id username displayName createdAt updatedAt'],
        ['tasks', tasks, { owner }, '_id title description status priority category dueDate tags dependsOn createdAt updatedAt __v'],
        ['activities', activities, { owner }, '_id task action message createdAt'],
        ['attachments', attachments, { owner }, '_id task originalName mimeType size createdAt updatedAt']
    ];
    const result = { format: 'flowforge-workspace', version: 1, exportedAt: new Date().toISOString(),
        includesFileBytes: false, collections: {} };
    // Sequential reads share the transaction snapshot. No parallel operations here.
    for (const [name, model, filter, projection] of definitions) {
        const rows = await model.find(filter).select(projection).session(context.session)
            .sort({ _id: 1 }).limit(EXPORT_LIMIT + 1).lean();
        if (rows.length > EXPORT_LIMIT) throw Object.assign(new Error('Export supports up to 1,000 records per collection; no partial export was created.'),
            { status: 413, code: 'EXPORT_TOO_LARGE' });
        const fields = projection.split(' ');
        result.collections[name] = rows.map(row => Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])));
    }
    return result;
}
