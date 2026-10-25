import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Attachment, MAX_ATTACHMENT_BYTES } from '../models/Attachment.js';
import { AttachmentBlob } from '../models/AttachmentBlob.js';
import { Task } from '../models/Task.js';

function unavailable() {
    return Object.assign(new Error('Attachment not found.'), { status: 404, code: 'DOWNLOAD_NOT_FOUND' });
}

export async function loadDownload(owner, taskId, attachmentId, {
    tasks = Task, attachments = Attachment, blobs = AttachmentBlob
} = {}) {
    if (![taskId, attachmentId].every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id))) {
        throw Object.assign(new Error('Valid task and attachment IDs are required.'), { status: 400, code: 'DOWNLOAD_INVALID' });
    }
    if (!await tasks.exists({ _id: taskId, owner })) throw unavailable();
    const metadata = await attachments.findOne({ _id: attachmentId, task: taskId, owner }).select('+storageKey');
    if (!metadata) throw unavailable();
    const blob = await blobs.findOne({ storageKey: metadata.storageKey, owner }).select('+data');
    if (!blob || !Buffer.isBuffer(blob.data) || blob.data.length !== metadata.size
        || !blob.data.length || blob.data.length > MAX_ATTACHMENT_BYTES) throw unavailable();
    // Protect headers even if an old record contains an unexpected filename.
    const filename = typeof metadata.originalName === 'string'
        && metadata.originalName.length <= 255
        && !/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(metadata.originalName)
        && metadata.originalName.trim() ? metadata.originalName : 'attachment';
    return { filename, data: blob.data };
}

export function downloadStream(data) {
    // Backpressure-aware HTTP chunks. MongoDB's bounded blob is already in memory.
    return Readable.from((function* () {
        for (let offset = 0; offset < data.length; offset += 64 * 1024) {
            yield data.subarray(offset, offset + 64 * 1024);
        }
    })());
}

export function createDownloadHandler({ load = loadDownload } = {}) {
    return async (req, res, next) => {
        try {
            const { filename, data } = await load(req.user.id, req.params.taskId, req.params.attachmentId);
            if (data.length > (req.app?.locals.attachmentLimit || MAX_ATTACHMENT_BYTES)) {
                throw Object.assign(new Error('This file exceeds the hosted download limit. Download it through the local server.'), { status: 413, code: 'DOWNLOAD_INVALID' });
            }
            res.attachment(filename);
            res.set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-store', 'Content-Length': String(data.length),
                'Content-Security-Policy': "sandbox; default-src 'none'" });
            if (req.method === 'HEAD') return res.end();
            await pipeline(downloadStream(data), res);
        } catch (error) {
            // pipeline closes both streams on cancellation/failure; never append JSON to a file.
            if (res.headersSent || res.destroyed) {
                if (!res.destroyed) res.destroy();
                return;
            }
            next(error);
        }
    };
}
