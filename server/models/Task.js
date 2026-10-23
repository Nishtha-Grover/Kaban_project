import mongoose from 'mongoose';

function validCalendarDate(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const taskSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 3000, default: '' },
    status: { type: String, enum: ['todo', 'inprogress', 'done'], required: true, default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], required: true, default: 'medium' },
    category: { type: String, required: true, trim: true, maxlength: 80, default: 'General' },
    // A calendar date, not a timestamp: preserve the day across client time zones.
    dueDate: { type: String, default: '', validate: { validator: validCalendarDate, message: 'Due date must be empty or a real YYYY-MM-DD date.' } },
    tags: {
        type: [{ type: String, trim: true, minlength: 1, maxlength: 30 }],
        default: [],
        validate: {
            validator: values => Array.isArray(values) && values.length <= 6 &&
                values.every(value => typeof value === 'string' && value.trim().length > 0) &&
                new Set(values.map(value => value.toLowerCase())).size === values.length,
            message: 'Use at most six nonempty, distinct tags.'
        }
    },
    dependsOn: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
        default: [],
        validate: {
            validator: function (ids) {
                return Array.isArray(ids) && ids.every(id => id != null && String(id) !== String(this._id)) &&
                    new Set(ids.map(String)).size === ids.length;
            },
            message: 'Dependencies must be distinct task IDs and cannot include the task itself.'
        }
    }
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });

// Support user-scoped board queries and upcoming deadlines.
taskSchema.index({ owner: 1, status: 1 });
taskSchema.index({ owner: 1, dueDate: 1 });

export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
