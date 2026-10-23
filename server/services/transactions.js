import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Attachment } from '../models/Attachment.js';
import { Activity } from '../models/Activity.js';
import { AttachmentBlob } from '../models/AttachmentBlob.js';
import { filesystemAudit } from './filesystemAudit.js';

function scopedModel(model, session) {
    return Object.fromEntries(['find', 'findOne', 'countDocuments', 'exists', 'deleteOne']
        .map(method => [method, (...args) => model[method](...args).session(session)]));
}

// Callbacks may be retried: keep emails, file operations and HTTP responses outside.
export async function runWorkspaceTransaction(owner, work, {
    connection = mongoose.connection, users = User, tasks = Task, attachments = Attachment, activities = Activity,
    publishAudit = records => filesystemAudit.publish(records)
} = {}) {
    let committedRecords = [];
    let result;
    try {
        result = await connection.transaction(async session => {
            // Discard records from an aborted attempt when the driver retries.
            committedRecords = [];
            // A shared write prevents concurrent tasks from bypassing graph invariants.
            // It must precede all task reads, including on each transaction retry.
            const lock = await users.updateOne({ _id: owner },
                { $inc: { workspaceRevision: 1 } }, { session, timestamps: false });
            if (lock.matchedCount !== 1) {
                throw Object.assign(new Error('Your account is unavailable. Sign in again.'),
                    { status: 401, code: 'WORKSPACE_UNAVAILABLE' });
            }
            const scopedTasks = scopedModel(tasks, session);
            return work({
                session, tasks: scopedTasks, attachments: scopedModel(attachments, session),
                countDependencies: filter => scopedTasks.countDocuments(filter),
                saveTask: task => task.save({ session }),
                saveAttachment: attachment => attachment.save({ session }),
                saveAttachmentBlob: blob => new AttachmentBlob(blob).save({ session }),
                recordActivity: async ({ task, action, message }) => {
                    const records = await activities.create([{ owner, task, action, message }], { session });
                    committedRecords.push(...records);
                    return records;
                }
            });
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    } catch (error) {
        if (error.code === 20) {
            throw Object.assign(new Error('Task changes require a MongoDB replica set or Atlas cluster.'),
                { status: 503, code: 'TRANSACTIONS_REQUIRED' });
        }
        throw error;
    }
    // File writes cannot roll back with MongoDB. Emit only after confirmed commit.
    // Secondary-log failure must not make a committed mutation appear unsuccessful.
    try { if (committedRecords.length) await publishAudit(committedRecords); }
    catch { console.warn('Filesystem audit unavailable; database history is preserved.'); }
    return result;
}
