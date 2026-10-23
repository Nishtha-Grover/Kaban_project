import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { startApiFixture } from './helpers/apiFixture.js';
import { User } from '../server/models/User.js';
import { Activity } from '../server/models/Activity.js';
import { Task } from '../server/models/Task.js';

test('live authentication and CRUD APIs on an isolated MongoDB replica set', { timeout: 90000 }, async t => {
    const fixture = await startApiFixture();
    t.after(() => fixture.close());
    const { request } = fixture;
    const password = 'Temporary-Test-Password-123!';
    let cookie, otherCookie, userId, task;
    await t.test('registration validates, hashes passwords and rejects duplicates', async () => {
        assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'a', password: 'short' } })).status, 400);
        const registered = await request('/api/auth/register', { method: 'POST', body: { username: 'student_one', password } });
        assert.equal(registered.status, 201); userId = registered.body.user.id;
        assert.equal(registered.body.user.passwordHash, undefined);
        const stored = await User.findById(userId).select('+passwordHash');
        assert.notEqual(stored.passwordHash, password); assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
        assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'STUDENT_ONE', password } })).status, 409);
    });
    await t.test('login sets protected cookie and rejects wrong credentials', async () => {
        assert.equal((await request('/api/auth/login', { method: 'POST', body: { username: 'student_one', password: 'wrong' } })).status, 401);
        const login = await request('/api/auth/login', { method: 'POST', body: { username: 'student_one', password } });
        assert.equal(login.status, 200);
        const header = login.headers.get('set-cookie');
        assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Strict/i);
        cookie = header.split(';')[0];
        assert.equal((await request('/api/auth/me', { cookie })).body.user.id, userId);
        assert.equal((await request('/api/tasks')).status, 401);
        assert.equal((await request('/api/tasks', { cookie: 'flowforge_session=tampered' })).status, 401);
    });
    await t.test('create, list and update persist task and transactional activity', async () => {
        const created = await request('/api/tasks', { method: 'POST', cookie, body: { title: 'API task', priority: 'high' } });
        assert.equal(created.status, 201); task = created.body.task;
        assert.equal((await request('/api/tasks', { cookie })).body.total, 1);
        const updated = await request(`/api/tasks/${task.id}`, { method: 'PATCH', cookie, body: { title: 'Updated task', version: task.version } });
        assert.equal(updated.status, 200); task = updated.body.task;
        assert.equal((await Task.findById(task.id)).title, 'Updated task');
        assert.deepEqual((await Activity.find({ task: task.id }).sort({ createdAt: 1 })).map(event => event.action), ['create', 'edit']);
    });
    await t.test('invalid fields, stale writes and cross-site mutation are rejected', async () => {
        assert.equal((await request('/api/tasks', { method: 'POST', cookie, body: { title: 'Spoof', owner: userId } })).status, 400);
        assert.equal((await request(`/api/tasks/${task.id}`, { method: 'PATCH', cookie, body: { title: 'Stale', version: -1 } })).status, 400);
        assert.equal((await request(`/api/tasks/${task.id}`, { method: 'PATCH', cookie, body: { title: 'Stale', version: task.version - 1 } })).status, 409);
        assert.equal((await request('/api/tasks', { method: 'POST', cookie, headers: { 'Sec-Fetch-Site': 'cross-site' }, body: { title: 'Blocked' } })).status, 403);
        assert.equal(await Activity.countDocuments({ task: task.id }), 2);
    });
    await t.test('another account cannot list, edit or delete the first account task', async () => {
        await request('/api/auth/register', { method: 'POST', body: { username: 'student_two', password } });
        const login = await request('/api/auth/login', { method: 'POST', body: { username: 'student_two', password } });
        otherCookie = login.headers.get('set-cookie').split(';')[0];
        assert.equal((await request('/api/tasks', { cookie: otherCookie })).body.total, 0);
        for (const method of ['PATCH', 'DELETE']) {
            const result = await request(`/api/tasks/${task.id}`, { method, cookie: otherCookie,
                body: { version: task.version, ...(method === 'PATCH' ? { title: 'Foreign edit' } : {}) } });
            assert.equal(result.status, 404);
        }
    });
    await t.test('delete preserves audit history; logout clears session cookie', async () => {
        assert.equal((await request(`/api/tasks/${task.id}`, { method: 'DELETE', cookie, body: { version: task.version } })).status, 204);
        assert.equal(await Task.findById(task.id), null);
        assert.equal(await Activity.countDocuments({ task: task.id, action: 'delete' }), 1);
        const logout = await request('/api/auth/logout', { method: 'POST', cookie, body: {} });
        assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /flowforge_session=;/);
        assert.equal((await request('/api/auth/me')).status, 401);
    });
});
