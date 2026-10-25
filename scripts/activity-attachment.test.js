import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Activity } from '../server/models/Activity.js';
import { Attachment, MAX_ATTACHMENT_BYTES } from '../server/models/Attachment.js';

const owner = new mongoose.Types.ObjectId();
const task = new mongoose.Types.ObjectId();
const makeFile = overrides => new Attachment({
    owner, task, originalName: 'assignment.pdf', storageKey: '12345678-1234-1234-1234-123456789012',
    mimeType: 'application/pdf', size: 1024, ...overrides
});

test('activity supports task events and bulk events without a task', async () => {
    await new Activity({ owner, task, action: 'edit', message: 'Updated assignment' }).validate();
    await new Activity({ owner, action: 'import', message: 'Imported three tasks' }).validate();
    assert.ok(Activity.schema.path('createdAt'));
    assert.equal(Activity.schema.path('updatedAt'), undefined);
});
test('activity rejects missing ownership, blank descriptions and unknown actions', async () => {
    for (const overrides of [{ owner: null }, { message: ' ' }, { action: 'unknown' }, { message: 'x'.repeat(1001) }]) {
        await assert.rejects(new Activity({ owner, action: 'create', message: 'Created task', ...overrides }).validate());
    }
});
test('attachment validates references and hides the private storage key', async () => {
    const file = makeFile(); await file.validate();
    assert.equal(Attachment.schema.path('owner').options.ref, 'User');
    assert.equal(Attachment.schema.path('task').options.ref, 'Task');
    assert.equal(Attachment.schema.path('storageKey').options.select, false);
    assert.equal(file.toJSON().storageKey, undefined);
    assert.equal(file.toObject().storageKey, undefined);
    for (const overrides of [{owner:null}, {task:null}]) await assert.rejects(makeFile(overrides).validate());
});
test('attachment rejects unsafe names and storage keys', async () => {
    for (const originalName of ['../secret', 'folder\\file.txt', 'bad\nname', '..', '']) {
        await assert.rejects(makeFile({ originalName }).validate());
    }
    for (const storageKey of ['../../secret', '/tmp/upload', 'short']) {
        await assert.rejects(makeFile({ storageKey }).validate());
    }
});
test('attachment enforces integer size bounds and MIME syntax', async () => {
    await makeFile({ size: MAX_ATTACHMENT_BYTES }).validate();
    for (const size of [0, -1, 1.5, MAX_ATTACHMENT_BYTES + 1, Infinity]) await assert.rejects(makeFile({ size }).validate());
    await assert.rejects(makeFile({mimeType:'not a MIME type'}).validate());
});
test('schema strictness and indexes support audit and attachment queries', () => {
    assert.throws(() => makeFile({ localPath: '/tmp/private' }), /strict/i);
    assert.ok(Attachment.schema.indexes().some(([keys, options]) => keys.storageKey === 1 && options.unique));
    assert.ok(Activity.schema.indexes().some(([keys]) => keys.owner === 1 && keys.createdAt === -1));
});
