import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { startApiFixture } from './helpers/apiFixture.js';
import { handler } from '../netlify/functions/api.mjs';

test('hosted adapter preserves authentication, tasks and binary attachments', { timeout: 90000 }, async t => {
    const fixture = await startApiFixture();
    t.after(() => fixture.close());
    async function call(path, method = 'GET', body, cookie, contentType = 'application/json') {
        return handler({ path, httpMethod: method, headers: { host: 'flowforge.example',
            'content-type': contentType, ...(cookie ? { cookie } : {}) },
        queryStringParameters: null, requestContext: {},
        body: body === undefined ? null : Buffer.isBuffer(body) ? body.toString('base64') : JSON.stringify(body),
        isBase64Encoded: Buffer.isBuffer(body) }, {});
    }
    assert.equal((await call('/api/health')).statusCode, 200);
    assert.equal((await call('/.netlify/functions/api/health')).statusCode, 200);
    for (const path of ['/.env', '/server/config.js', '/index.html']) assert.equal((await call(path)).statusCode, 404);
    const credentials = { username: 'hosted_student', password: 'Hosting-Test-Password-123!' };
    assert.equal((await call('/api/auth/register', 'POST', credentials)).statusCode, 201);
    const login = await call('/api/auth/login', 'POST', credentials);
    assert.equal(login.statusCode, 200);
    const header = login.multiValueHeaders?.['set-cookie']?.[0] || login.headers['set-cookie'];
    assert.match(header, /Secure/); assert.match(header, /HttpOnly/);
    const cookie = header.split(';')[0];
    const created = await call('/api/tasks', 'POST', { title: 'Hosted task' }, cookie);
    assert.equal(created.statusCode, 201);
    const id = JSON.parse(created.body).task.id;
    const prefix = `/api/tasks/${id}/attachments`;
    const boundary = 'flowforge-test-boundary';
    function multipart(data) { return Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`)]); }
    const bytes = Buffer.from('Hosted file round trip\n');
    const uploaded = await call(prefix, 'POST', multipart(bytes), cookie, `multipart/form-data; boundary=${boundary}`);
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const attachmentId = JSON.parse(uploaded.body).attachment.id;
    const downloaded = await call(`${prefix}/${attachmentId}/download`, 'GET', undefined, cookie);
    assert.equal(downloaded.statusCode, 200); assert.equal(downloaded.isBase64Encoded, true);
    assert.deepEqual(Buffer.from(downloaded.body, 'base64'), bytes);
    assert.equal((await call(prefix, 'POST', multipart(Buffer.alloc(3 * 1024 * 1024 + 1, 65)), cookie, `multipart/form-data; boundary=${boundary}`)).statusCode, 413);
    const saved = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
    try { const failed = await call('/api/health'); assert.equal(failed.statusCode, 503); assert.doesNotMatch(failed.body, /mongodb|password|stack/i); }
    finally { process.env.JWT_SECRET = saved; }
});

test('public build excludes private files', async () => {
    const files = await readdir(new URL('../dist/', import.meta.url), { recursive: true });
    for (const required of ['index.html', 'studio.html', 'data/student-tasks.json']) assert.ok(files.includes(required));
    assert.ok(files.every(path => !/(^|\/)(\.env|server|node_modules|docs|logs|netlify)(\/|$)/.test(path)));
});
