import test from 'node:test';
import assert from 'node:assert/strict';
import { startApiFixture } from './helpers/apiFixture.js';
import { Task } from '../server/models/Task.js';
import { Activity } from '../server/models/Activity.js';
import { Attachment, MAX_ATTACHMENT_BYTES } from '../server/models/Attachment.js';
import { AttachmentBlob } from '../server/models/AttachmentBlob.js';
import { runWorkspaceTransaction } from '../server/services/transactions.js';
import { saveUpload } from '../server/services/uploads.js';

test('live dependency and upload integration', { timeout: 90000 }, async t => {
    const fixture = await startApiFixture(); t.after(() => fixture.close());
    const { request, baseUrl } = fixture;
    async function account(username) {
        const body = { username, password: 'Temporary-Integration-Password-123!' };
        const registered = await request('/api/auth/register', { method: 'POST', body });
        assert.equal(registered.status, 201);
        const login = await request('/api/auth/login', { method: 'POST', body });
        assert.equal(login.status, 200);
        return { id: registered.body.user.id, cookie: login.headers.get('set-cookie').split(';')[0] };
    }
    const owner = await account('dependency_owner'), other = await account('other_owner');
    async function create(title, dependsOn = []) {
        const result = await request('/api/tasks', { method: 'POST', cookie: owner.cookie, body: { title, dependsOn } });
        assert.equal(result.status, 201); return result.body.task;
    }
    const patch = (task, changes) => request(`/api/tasks/${task.id}`, { method: 'PATCH', cookie: owner.cookie,
        body: { version: task.version, ...changes } });
    let uploadTask, attachmentId;

    await t.test('cycles and unfinished prerequisites are rejected; completion unlocks dependent work', async () => {
        let a = await create('Plan'), b = await create('Build', [a.id]);
        assert.equal((await patch(a, { dependsOn: [b.id] })).status, 400);
        assert.equal((await patch(b, { status: 'inprogress' })).status, 409);
        const done = await patch(a, { status: 'done' }); assert.equal(done.status, 200); a = done.body.task;
        const started = await patch(b, { status: 'inprogress' }); assert.equal(started.status, 200); b = started.body.task;
        assert.equal((await patch(a, { status: 'todo' })).status, 409);
        assert.equal((await request(`/api/tasks/${a.id}`, { method: 'DELETE', cookie: owner.cookie, body: { version: a.version } })).status, 409);
        assert.equal((await Task.findById(a.id)).status, 'done');
    });

    await t.test('simultaneous opposite dependency links cannot commit a cycle', async () => {
        const a = await create('Concurrent A'), b = await create('Concurrent B');
        const results = await Promise.all([patch(a, { dependsOn: [b.id] }), patch(b, { dependsOn: [a.id] })]);
        assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
        const rows = await Task.find({ _id: { $in: [a.id, b.id] } });
        assert.equal(rows.reduce((total, row) => total + row.dependsOn.length, 0), 1);
    });

    async function upload({ cookie = owner.cookie, name = 'notes.txt', type = 'text/plain', bytes = 'Project notes', field = 'file' } = {}) {
        const form = new FormData(); form.append(field, new Blob([bytes], { type }), name);
        return fetch(`${baseUrl}/api/tasks/${uploadTask.id}/attachments`, { method: 'POST',
            headers: cookie ? { Cookie: cookie } : {}, body: form });
    }
    await t.test('valid multipart upload commits metadata, bytes and activity', async () => {
        uploadTask = await create('Attachment task');
        const response = await upload(); assert.equal(response.status, 201);
        const data = await response.json(); attachmentId = data.attachment.id;
        assert.equal(data.attachment.storageKey, undefined);
        const metadata = await Attachment.findById(attachmentId).select('+storageKey');
        const blob = await AttachmentBlob.findOne({ storageKey: metadata.storageKey }).select('+data');
        assert.equal(blob.data.toString(), 'Project notes');
        assert.equal(await Activity.countDocuments({ task: uploadTask.id, action: 'upload' }), 1);
    });
    await t.test('invalid and oversized uploads cannot persist records', async () => {
        for (const [options, expected] of [
            [{ name: 'script.exe' }, 415], [{ name: 'fake.pdf', type: 'application/pdf', bytes: 'not a PDF' }, 415],
            [{ bytes: '' }, 400], [{ bytes: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 65) }, 413],
            [{ field: 'wrong' }, 400], [{ cookie: other.cookie }, 404], [{ cookie: '' }, 401]
        ]) {
            const response = await upload(options); assert.equal(response.status, expected); await response.arrayBuffer();
        }
        assert.equal(await Attachment.countDocuments({ task: uploadTask.id }), 1);
        assert.equal(await AttachmentBlob.countDocuments({ owner: owner.id }), 1);
        assert.equal(await Activity.countDocuments({ task: uploadTask.id, action: 'upload' }), 1);
    });
    await t.test('downloads preserve bytes and deny missing or foreign sessions', async () => {
        const path = `/api/tasks/${uploadTask.id}/attachments/${attachmentId}/download`;
        const response = await fetch(baseUrl + path, { headers: { Cookie: owner.cookie } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-disposition'), /attachment/);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(await response.text(), 'Project notes');
        for (const [cookie, status] of [[other.cookie, 404], ['', 401]]) {
            const denied = await fetch(baseUrl + path, { headers: cookie ? { Cookie: cookie } : {} });
            assert.equal(denied.status, status); await denied.arrayBuffer();
        }
        const head = await fetch(baseUrl + path, { method: 'HEAD', headers: { Cookie: owner.cookie } });
        assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
        assert.equal((await request(`/api/tasks/${uploadTask.id}`, { method: 'DELETE', cookie: owner.cookie,
            body: { version: uploadTask.version } })).status, 409);
    });
    await t.test('forced transaction failure rolls back file bytes, metadata and audit together', async () => {
        const before = await Activity.countDocuments({ owner: owner.id });
        await assert.rejects(runWorkspaceTransaction(owner.id, async context => {
            await saveUpload(owner.id, uploadTask.id, { originalname: 'rollback.txt', mimetype: 'text/plain', buffer: Buffer.from('Rollback') }, context);
            throw new Error('Deliberate rollback test');
        }), /Deliberate rollback test/);
        assert.equal(await Attachment.countDocuments({ task: uploadTask.id }), 1);
        assert.equal(await AttachmentBlob.countDocuments({ owner: owner.id }), 1);
        assert.equal(await Activity.countDocuments({ owner: owner.id }), before);
    });
});
