import test from 'node:test';
import assert from 'node:assert/strict';
import { startApiFixture } from './helpers/apiFixture.js';
import { loadDatabaseTasks, createDatabaseTask, updateDatabaseTask, deleteDatabaseTask } from '../js/taskApi.js';

test('task client uses authenticated API and preserves optimistic concurrency', { timeout: 90000 }, async t => {
    const fixture = await startApiFixture();
    const nativeFetch = globalThis.fetch;
    let cookie = '';
    t.after(async () => { globalThis.fetch = nativeFetch; await fixture.close(); });
    globalThis.fetch = async (path, options = {}) => {
        const headers = new Headers(options.headers);
        if (cookie) headers.set('Cookie', cookie);
        const response = await nativeFetch(new URL(path, fixture.baseUrl), { ...options, headers });
        for (const value of response.headers.getSetCookie()) cookie = value.split(';')[0];
        return response;
    };
    await assert.rejects(loadDatabaseTasks(), error => error.status === 401);
    const credentials = { username: 'taskclient', password: 'TaskClient-Password-123!' };
    for (const action of ['register', 'login']) {
        const response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
        assert.ok(response.ok);
    }
    assert.deepEqual(await loadDatabaseTasks(), []);
    const original = await createDatabaseTask({ title: 'Client task', owner: 'ignored', status: 'done' });
    assert.equal(original.status, 'todo');
    assert.equal((await loadDatabaseTasks())[0].id, original.id);
    const edited = await updateDatabaseTask(original, { title: 'Updated task', status: 'inprogress' });
    assert.equal(edited.title, 'Updated task');
    assert.ok(edited.version > original.version);
    await assert.rejects(updateDatabaseTask(original, { title: 'Stale overwrite' }), error => error.status === 409);
    await assert.rejects(deleteDatabaseTask(original), error => error.status === 409);
    assert.equal((await loadDatabaseTasks())[0].title, 'Updated task');
    await deleteDatabaseTask(edited);
    assert.deepEqual(await loadDatabaseTasks(), []);
    await assert.rejects(updateDatabaseTask({ id: 'local-task', version: 0 }, {}), /Reload/);
});

test('pagination fails without exposing partial results', async t => {
    const nativeFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = nativeFetch; });
    const task = { id: 'a'.repeat(24), version: 0 };
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ tasks: [task], page: calls, totalPages: 2 }), { status: calls === 2 ? 503 : 200 });
    };
    await assert.rejects(loadDatabaseTasks(), error => error.status === 503);
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => new Response(JSON.stringify({ tasks: [{ ...task, id: (++calls).toString(16).padStart(24, '0') }], page: calls, totalPages: 2 }));
    assert.equal((await loadDatabaseTasks()).length, 2);
});
