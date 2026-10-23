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
function pick(record, fields) {
    return Object.fromEntries(fields.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
}
export function relationshipOptions(owner, collection) {
    const options = [];
    if (collection !== 'users') options.push({ path: 'owner', select: '_id username displayName', match: { _id: owner } });
    const path = collection === 'tasks' ? 'dependsOn' : ['activities', 'attachments'].includes(collection) ? 'task' : null;
    if (path) options.push({ path, select: '_id owner title status', match: { owner } });
    return options;
}
function publicRelationships(record, owner, collection) {
    if (collection !== 'users') record.owner = record.owner && String(record.owner._id) === String(owner)
        ? pick(record.owner, ['_id', 'username', 'displayName']) : null;
    const task = value => value && String(value.owner) === String(owner) ? pick(value, ['_id', 'title', 'status']) : null;
    if (collection === 'tasks') record.dependsOn = (record.dependsOn ?? []).map(task).filter(Boolean);
    if (['activities', 'attachments'].includes(collection)) record.task = task(record.task);
    return record;
}
export async function exploreDocuments(owner, collection, query = {}, { models = {} } = {}) {
    const config = collections.get(collection);
    if (!config || Object.keys(query).some(key => !['page', 'limit', 'expand'].includes(key))) throw invalid();
    if (query.expand !== undefined && query.expand !== 'relationships') throw invalid();
    const expanded = query.expand === 'relationships';
    const integer = (value, fallback, max) => {
        if (value === undefined) return fallback;
        if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw invalid();
        return Number(value);
    };
    const page = integer(query.page, 1, 10000), limit = integer(query.limit, 10, 50);
    const model = models[collection] ?? config.model;
    const filter = config.self ? { _id: owner } : { owner };
    let documentsQuery = model.find(filter).select(config.fields).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
    if (expanded) for (const option of relationshipOptions(owner, collection)) documentsQuery = documentsQuery.populate(option);
    const [rows, total] = await Promise.all([
        documentsQuery.lean(),
        model.countDocuments(filter)
    ]);
    // Defense in depth: don't rely solely on schema defaults or query projection.
    const fields = config.fields.split(' ');
    const documents = rows.map(row => {
        const record = pick(row, fields);
        return expanded ? publicRelationships(record, owner, collection) : record;
    });
    return { collection, documents, expanded, page, limit, total, totalPages: Math.ceil(total / limit) };
}
