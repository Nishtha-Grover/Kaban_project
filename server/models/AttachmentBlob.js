import mongoose from 'mongoose';
import { MAX_ATTACHMENT_BYTES } from './Attachment.js';

// Private bytes are stored separately from metadata and never populated publicly.
const schema = new mongoose.Schema({
    storageKey: { type: String, required: true, immutable: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    data: { type: Buffer, required: true, select: false,
        validate: value => value.length > 0 && value.length <= MAX_ATTACHMENT_BYTES }
}, { strict: 'throw', timestamps: { createdAt: true, updatedAt: false } });
schema.index({ storageKey: 1 }, { unique: true });
export const AttachmentBlob = mongoose.models.AttachmentBlob || mongoose.model('AttachmentBlob', schema);
