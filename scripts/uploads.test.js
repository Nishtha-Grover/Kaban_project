import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseUpload } from '../server/routes/attachments.js';
import { saveUpload } from '../server/services/uploads.js';
import { MAX_ATTACHMENT_BYTES } from '../server/models/Attachment.js';

const owner = 'a'.repeat(24), taskId = 'b'.repeat(24);
const file = { originalname: 'notes.txt', mimetype: 'text/plain', buffer: Buffer.from('Notes') };
function fixture() {
    const events = [];
    return { events, context: {
        tasks: { findOne: async filter => {
            assert.deepEqual(filter, { _id: taskId, owner }); return { _id: taskId };
        } },
        saveAttachmentBlob: async blob => { events.push('bytes'); assert.deepEqual(blob.data, file.buffer); },
        saveAttachment: async metadata => { events.push('metadata'); metadata.createdAt = new Date(); },
        recordActivity: async activity => { events.push('audit'); assert.equal(activity.action, 'upload'); }
    } };
}
test('stores bytes and metadata before audit and returns only public fields', async () => {
    const { events, context } = fixture();
    const result = await saveUpload(owner, taskId, file, context);
    assert.deepEqual(events, ['bytes', 'metadata', 'audit']);
    assert.equal(result.size, 5);
    assert.equal(result.originalName, 'notes.txt');
    assert.equal(result.storageKey, undefined);
    assert.equal(result.owner, undefined);
});
test('rejects empty files and foreign tasks before persistence', async () => {
    const { events, context } = fixture();
    await assert.rejects(saveUpload(owner, taskId, null, context), { status: 400 });
    context.tasks.findOne = async () => null;
    await assert.rejects(saveUpload(owner, taskId, file, context), { status: 404 });
    assert.deepEqual(events, []);
});
test('invalid filenames fail before storing bytes; audit errors propagate to transaction', async () => {
    const { events, context } = fixture();
    await assert.rejects(saveUpload(owner, taskId, { ...file, originalname: '../notes' }, context), { status: 400 });
    assert.deepEqual(events, []);
    context.recordActivity = async () => { throw new Error('audit failed'); };
    await assert.rejects(saveUpload(owner, taskId, file, context), /audit failed/);
});

async function multipart(field = 'file', content = 'Notes', filename = 'notes.txt') {
    const boundary = 'flowforge-test-boundary';
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`);
    const req = Readable.from([body]);
    req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) };
    await new Promise((resolve, reject) => parseUpload(req, {}, error => error ? reject(error) : resolve()));
    return req;
}
test('real Multer parses one multipart file into a Buffer', async () => {
    const req = await multipart();
    assert.equal(req.file.originalname, 'notes.txt');
    assert.equal(req.file.buffer.toString(), 'Notes');
});
test('real Multer rejects an unexpected file field', async () => {
    await assert.rejects(multipart('unexpected'), { code: 'LIMIT_UNEXPECTED_FILE' });
});
test('real Multer rejects oversized payloads and disallowed extensions', async () => {
    await assert.rejects(multipart('file', 'a'.repeat(MAX_ATTACHMENT_BYTES + 1)), { code: 'LIMIT_FILE_SIZE' });
    await assert.rejects(multipart('file', 'text', 'script.exe'), { status: 415 });
});
