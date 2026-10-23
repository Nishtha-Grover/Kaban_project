import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';
import { Attachment } from '../models/Attachment.js';
import { AttachmentBlob } from '../models/AttachmentBlob.js';

const collections = new Map([
    ['users', { model: User, fields: '_id username displayName createdAt updatedAt', self: true }],
    ['tasks', { model: Task, fields: '_id owner title description status priority category dueDate tags dependsOn createdAt updatedAt __v' }],
    ['activities', { model: Activity, fields: '_id owner task action message createdAt' }],
    ['attachments', { model: Attachment, fields: '_id owner task originalName mimeType size createdAt updatedAt' }],
    ['blobs', { model: AttachmentBlob, fields: '_id owner createdAt' }]
]);
function invalid() {
    return Object.assign(new Error('Choose a supported collection and valid page size.'), { status: 400, code: 'EXPLORER_INVALID' });
}
export async function exploreDocuments(owner, collection, query = {}, { models = {} } = {}) {
    const config = collections.get(collection);
    if (!config || Object.keys(query).some(key => !['page', 'limit'].includes(key))) throw invalid();
    const integer = (value, fallback, max) => {
        if (value === undefined) return fallback;
        if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw invalid();
        return Number(value);
    };
    const page = integer(query.page, 1, 10000), limit = integer(query.limit, 10, 50);
    const model = models[collection] ?? config.model;
    const filter = config.self ? { _id: owner } : { owner };
    const [rows, total] = await Promise.all([
        model.find(filter).select(config.fields).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        model.countDocuments(filter)
    ]);
    // Defense in depth: don't rely solely on schema defaults or query projection.
    const fields = config.fields.split(' ');
    const documents = rows.map(row => Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])));
    return { collection, documents, page, limit, total, totalPages: Math.ceil(total / limit) };
}
