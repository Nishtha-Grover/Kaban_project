import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { Task } from '../models/Task.js';
import { Attachment, MAX_ATTACHMENT_BYTES } from '../models/Attachment.js';
import { AttachmentBlob } from '../models/AttachmentBlob.js';
import { runWorkspaceTransaction } from '../services/transactions.js';
import { saveUpload, uploadError } from '../services/uploads.js';
import { validateUploadMetadata } from '../services/uploadValidation.js';
import { createDownloadHandler } from '../services/downloads.js';

export const parseUpload = (req, res, next) => multer({ storage: multer.memoryStorage(),
    fileFilter(req, file, callback) {
        try { validateUploadMetadata(file); callback(null, true); }
        catch (error) { callback(error); }
    },
    limits: { fileSize: req.app.locals.attachmentLimit || MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 }
}).single('file')(req, res, next);

export const attachmentsRouter = Router({ mergeParams: true });
attachmentsRouter.get('/', requireAuth, async (req, res, next) => {
    try {
        if (!/^[a-f0-9]{24}$/i.test(req.params.taskId)) throw uploadError('A valid task ID is required.');
        if (Object.keys(req.query).some(key => key !== 'page') || (req.query.page !== undefined && !/^[1-9]\d{0,4}$/.test(req.query.page))) throw uploadError('Invalid page.');
        if (!await Task.exists({ _id: req.params.taskId, owner: req.user.id })) throw uploadError('Task not found.', 404);
        const page = Number(req.query.page || 1), filter = { owner: req.user.id, task: req.params.taskId };
        const [rows, total] = await Promise.all([
            Attachment.find(filter).select('_id originalName mimeType size createdAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
            Attachment.countDocuments(filter)
        ]);
        res.set('Cache-Control', 'private, no-store').json({ attachments: rows.map(row => ({ id: String(row._id),
            originalName: row.originalName, mimeType: row.mimeType, size: row.size, createdAt: row.createdAt })), page, totalPages: Math.ceil(total / 20), total,
            maxFileBytes: req.app.locals.attachmentLimit || MAX_ATTACHMENT_BYTES });
    } catch (error) { next(error); }
});
attachmentsRouter.delete('/:attachmentId', requireAuth, async (req, res, next) => {
    try {
        if (req.get('Sec-Fetch-Site') === 'cross-site') throw uploadError('Use this application to remove files.', 403);
        if (!req.is('application/json')) throw uploadError('Send application/json.', 415);
        if (![req.params.taskId, req.params.attachmentId].every(id => /^[a-f0-9]{24}$/i.test(id))) throw uploadError('Valid task and attachment IDs are required.');
        await runWorkspaceTransaction(req.user.id, async context => {
            const filter = { _id: req.params.attachmentId, task: req.params.taskId, owner: req.user.id };
            if (!await context.tasks.exists({ _id: req.params.taskId, owner: req.user.id })) throw uploadError('Task not found.', 404);
            const attachment = await context.attachments.findOne(filter).select('+storageKey');
            if (!attachment) throw uploadError('Attachment not found.', 404);
            await AttachmentBlob.deleteOne({ owner: req.user.id, storageKey: attachment.storageKey }).session(context.session);
            await context.attachments.deleteOne(filter);
            await context.recordActivity({ task: req.params.taskId, action: 'delete-attachment', message: `Removed attachment: ${attachment.originalName}` });
        });
        res.status(204).end();
    } catch (error) { next(error); }
});
attachmentsRouter.get('/:attachmentId/download', requireAuth, createDownloadHandler());
attachmentsRouter.post('/', requireAuth, async (req, res, next) => {
    try {
        if (req.get('Sec-Fetch-Site') === 'cross-site') throw uploadError('Use this application to upload files.', 403);
        if (!/^[a-f0-9]{24}$/i.test(req.params.taskId)) throw uploadError('A valid task ID is required.');
        if (!req.is('multipart/form-data')) throw uploadError('Send multipart/form-data with a file field.', 415);
        // Reject foreign tasks before buffering file data. Rechecked under the workspace lock.
        if (!await Task.exists({ _id: req.params.taskId, owner: req.user.id })) throw uploadError('Task not found.', 404);
        next();
    } catch (error) { next(error); }
}, parseUpload, async (req, res, next) => {
    try {
        const attachment = await runWorkspaceTransaction(req.user.id,
            context => saveUpload(req.user.id, req.params.taskId, req.file, context));
        res.status(201).json({ attachment });
    } catch (error) { next(error); }
});

attachmentsRouter.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';
        return res.status(tooLarge ? 413 : 400).json({ error: { code: error.code,
            message: tooLarge ? `File exceeds ${(req.app.locals.attachmentLimit || MAX_ATTACHMENT_BYTES) / 1024 / 1024} MiB.` : 'Upload exactly one file in the file field, with no extra fields.' } });
    }
    if (['UPLOAD_INVALID', 'TRANSACTIONS_REQUIRED', 'WORKSPACE_UNAVAILABLE', 'DOWNLOAD_INVALID', 'DOWNLOAD_NOT_FOUND'].includes(error.code)) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    next(error);
});
