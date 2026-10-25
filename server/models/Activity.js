import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, immutable: true },
    action: {
        type: String,
        required: true,
        enum: ['create', 'edit', 'move', 'delete', 'import', 'undo', 'upload', 'download', 'delete-attachment'],
        immutable: true
    },
    // A readable snapshot remains useful after the task has been deleted.
    message: { type: String, required: true, trim: true, maxlength: 1000, immutable: true }
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

activitySchema.index({ owner: 1, createdAt: -1 });
activitySchema.index({ owner: 1, task: 1, createdAt: -1 });

export const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
