import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { Task } from '../models/Task.js';
import { MAX_ATTACHMENT_BYTES } from '../models/Attachment.js';
import { runWorkspaceTransaction } from '../services/transactions.js';
import { saveUpload, uploadError } from '../services/uploads.js';

export const parseUpload = multer({ storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 1 }
}).single('file');

export const attachmentsRouter = Router({ mergeParams: true });
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
            message: tooLarge ? 'File exceeds 10 MiB.' : 'Upload exactly one file in the file field, with no extra fields.' } });
    }
    if (['UPLOAD_INVALID', 'TRANSACTIONS_REQUIRED', 'WORKSPACE_UNAVAILABLE'].includes(error.code)) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    next(error);
});
