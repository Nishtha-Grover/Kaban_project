import { randomUUID } from 'node:crypto';
import { Attachment } from '../models/Attachment.js';
import { validateUpload, uploadError } from './uploadValidation.js';
export { uploadError } from './uploadValidation.js';

export async function saveUpload(owner, taskId, file, context) {
    const validated = validateUpload(file);
    const task = await context.tasks.findOne({ _id: taskId, owner });
    if (!task) throw uploadError('Task not found.', 404);
    const metadata = new Attachment({ owner, task: taskId, originalName: validated.originalName,
        mimeType: validated.mimeType, storageKey: randomUUID(), size: validated.size });
    try { await metadata.validate(); }
    catch { throw uploadError('Invalid filename or file metadata.'); }
    // Both inserts and the audit belong to the same transaction. Retry-safe: no disk writes.
    await context.saveAttachmentBlob({ owner, storageKey: metadata.storageKey, data: file.buffer });
    await context.saveAttachment(metadata);
    await context.recordActivity({ task: taskId, action: 'upload', message: `Uploaded attachment: ${metadata.originalName}` });
    return { id: String(metadata._id), task: String(metadata.task), originalName: metadata.originalName,
        mimeType: metadata.mimeType, size: metadata.size, createdAt: metadata.createdAt };
}
