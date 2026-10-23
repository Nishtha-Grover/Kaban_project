import { randomUUID } from 'node:crypto';
import { Attachment, MAX_ATTACHMENT_BYTES } from '../models/Attachment.js';

export function uploadError(message, status = 400) {
    return Object.assign(new Error(message), { status, code: 'UPLOAD_INVALID' });
}

export async function saveUpload(owner, taskId, file, context) {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw uploadError('Choose a non-empty file.');
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw uploadError('File exceeds 10 MiB.', 413);
    const task = await context.tasks.findOne({ _id: taskId, owner });
    if (!task) throw uploadError('Task not found.', 404);
    const metadata = new Attachment({ owner, task: taskId, originalName: file.originalname,
        mimeType: file.mimetype, storageKey: randomUUID(), size: file.buffer.length });
    try { await metadata.validate(); }
    catch { throw uploadError('Invalid filename or file metadata.'); }
    // Both inserts and the audit belong to the same transaction. Retry-safe: no disk writes.
    await context.saveAttachmentBlob({ owner, storageKey: metadata.storageKey, data: file.buffer });
    await context.saveAttachment(metadata);
    await context.recordActivity({ task: taskId, action: 'upload', message: `Uploaded attachment: ${metadata.originalName}` });
    return { id: String(metadata._id), task: String(metadata.task), originalName: metadata.originalName,
        mimeType: metadata.mimeType, size: metadata.size, createdAt: metadata.createdAt };
}
