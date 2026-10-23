import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { createApp } from '../../server/app.js';
import { connectDatabase, disconnectDatabase } from '../../server/database.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

export async function startApiFixture() {
    const directory = await mkdtemp(join(tmpdir(), 'flowforge-api-test-'));
    let mongo, server, admin, spawnError;
    const oldEnv = Object.fromEntries(['NODE_ENV', 'MONGODB_URI', 'JWT_SECRET'].map(key => [key, process.env[key]]));
    async function close() {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        await disconnectDatabase();
        await admin?.close();
        if (mongo && mongo.exitCode === null && !spawnError) {
            const stopped = once(mongo, 'exit'); mongo.kill('SIGTERM');
            const timer = setTimeout(() => mongo.kill('SIGKILL'), 5000);
            await stopped; clearTimeout(timer);
        }
        for (const [key, value] of Object.entries(oldEnv)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await rm(directory, { recursive: true, force: true });
    }
    try {
        const port = await freePort();
        mongo = spawn(process.env.MONGOD_BINARY || 'mongod', ['--dbpath', directory, '--port', String(port),
            '--bind_ip', '127.0.0.1', '--replSet', 'flowforgeTest', '--oplogSize', '32', '--quiet'], { stdio: 'ignore' });
        mongo.on('error', error => { spawnError = error; });
        const directUri = `mongodb://127.0.0.1:${port}/admin?directConnection=true`;
        let connected = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            if (spawnError || mongo.exitCode !== null) throw new Error('Test mongod could not start. Install MongoDB or set MONGOD_BINARY.');
            admin = new mongoose.mongo.MongoClient(directUri, { serverSelectionTimeoutMS: 300 });
            try { await admin.connect(); connected = true; break; }
            catch { await admin.close(); await pause(100); }
        }
        if (!connected) throw new Error('Temporary MongoDB startup timed out.');
        await admin.db('admin').command({ replSetInitiate: { _id: 'flowforgeTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
        let primary = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            if ((await admin.db('admin').command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
            await pause(100);
        }
        if (!primary) throw new Error('Test replica set did not elect a primary.');
        process.env.NODE_ENV = 'test';
        process.env.JWT_SECRET = 'isolated-test-secret-never-used-for-deployment-12345';
        process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/flowforge_test?replicaSet=flowforgeTest`;
        await connectDatabase(process.env.MONGODB_URI);
        server = createApp().listen(0, '127.0.0.1');
        await once(server, 'listening');
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        async function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
            const response = await fetch(baseUrl + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}),
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            const text = await response.text();
            return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
        }
        return { request, baseUrl, close };
    } catch (error) { await close(); throw error; }
}
