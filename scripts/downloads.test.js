import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { loadDownload, downloadStream, createDownloadHandler } from '../server/services/downloads.js';

const owner = 'a'.repeat(24), taskId = 'b'.repeat(24), attachmentId = 'c'.repeat(24);
function fixture() {
    return {
        tasks: { exists: async filter => { assert.deepEqual(filter, { _id: taskId, owner }); return true; } },
        attachments: { findOne: filter => {
            assert.deepEqual(filter, { _id: attachmentId, task: taskId, owner });
            return { select: async fields => { assert.equal(fields, '+storageKey');
                return { storageKey: 'private-key', originalName: 'notes.txt', size: 5 }; } };
        } },
        blobs: { findOne: filter => {
            assert.deepEqual(filter, { storageKey: 'private-key', owner });
            return { select: async fields => { assert.equal(fields, '+data'); return { data: Buffer.from('Notes') }; } };
        } }
    };
}
test('scopes task, metadata and blob access to the owner', async () => {
    const result = await loadDownload(owner, taskId, attachmentId, fixture());
    assert.equal(result.filename, 'notes.txt');
    assert.equal(result.data.toString(), 'Notes');
});
test('rejects malformed IDs before queries and hides unavailable resources', async () => {
    await assert.rejects(loadDownload(owner, 'invalid', attachmentId, {}), { status: 400 });
    for (const stage of ['tasks', 'attachments', 'blobs']) {
        const deps = fixture();
        if (stage === 'tasks') deps.tasks.exists = async () => false;
        else deps[stage].findOne = () => ({ select: async () => null });
        await assert.rejects(loadDownload(owner, taskId, attachmentId, deps), { code: 'DOWNLOAD_NOT_FOUND' });
    }
});
test('refuses inconsistent stored bytes', async () => {
    const deps = fixture();
    deps.blobs.findOne = () => ({ select: async () => ({ data: Buffer.from('truncated') }) });
    await assert.rejects(loadDownload(owner, taskId, attachmentId, deps), { status: 404 });
});
test('streams exact bytes in bounded chunks', async () => {
    const data = Buffer.alloc(150000, 97), chunks = [];
    for await (const chunk of downloadStream(data)) {
        assert.ok(chunk.length <= 65536); chunks.push(chunk);
    }
    assert.deepEqual(Buffer.concat(chunks), data);
});
test('download handler sets attachment protections and streams content', async () => {
    const chunks = [], headers = {};
    const res = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
    res.attachment = name => { headers.filename = name; };
    res.set = values => Object.assign(headers, values);
    const handler = createDownloadHandler({ load: async (user, task, attachment) => {
        assert.deepEqual([user, task, attachment], [owner, taskId, attachmentId]);
        return { filename: 'notes.txt', data: Buffer.from('Notes') };
    } });
    await handler({ method: 'GET', user: { id: owner }, params: { taskId, attachmentId } }, res, assert.fail);
    assert.equal(Buffer.concat(chunks).toString(), 'Notes');
    assert.equal(headers['Content-Type'], 'application/octet-stream');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Cache-Control'], 'private, no-store');
    assert.equal(headers['Content-Length'], '5');
});
test('lookup errors reach error middleware before any body is sent', async () => {
    const error = new Error('missing');
    let forwarded;
    await createDownloadHandler({ load: async () => { throw error; } })(
        { user: { id: owner }, params: { taskId, attachmentId } }, {}, value => { forwarded = value; });
    assert.equal(forwarded, error);
});
test('client disconnect destroys pipeline without forwarding a second response', async () => {
    const res = new Writable({ write(chunk, encoding, callback) { callback(new Error('client disconnected')); } });
    res.attachment = () => {};
    res.set = () => {};
    await createDownloadHandler({ load: async () => ({ filename: 'a', data: Buffer.alloc(100000) }) })(
        { method: 'GET', user: { id: owner }, params: { taskId, attachmentId } }, res, () => assert.fail('no second response'));
    assert.equal(res.destroyed, true);
});
