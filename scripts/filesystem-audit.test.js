import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilesystemAudit } from '../server/services/filesystemAudit.js';
import { runWorkspaceTransaction } from '../server/services/transactions.js';

const record = { _id: 'activity1', owner: 'owner', task: 'task', action: 'create',
    createdAt: new Date('2026-01-01'), message: 'Private title', password: 'secret' };

test('EventEmitter writes ordered JSON lines to a real temporary file without private fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flowforge-audit-'));
    try {
        const file = join(directory, 'logs', 'activity.jsonl');
        const audit = createFilesystemAudit({ file });
        await Promise.all([audit.publish([record]), audit.publish([{ ...record, _id: 'activity2' }])]);
        const text = await readFile(file, 'utf8');
        const rows = text.trim().split('\n').map(line => JSON.parse(line));
        assert.deepEqual(rows.map(row => row.activityId), ['activity1', 'activity2']);
        assert.equal(rows[0].createdAt, '2026-01-01T00:00:00.000Z');
        assert.equal(text.includes('Private title'), false);
        assert.equal(text.includes('secret'), false);
    } finally { await rm(directory, { recursive: true, force: true }); }
});

test('file failure is reported safely and does not poison later writes', async () => {
    let calls = 0;
    let warnings = 0;
    const audit = createFilesystemAudit({ makeDirectory: async () => {},
        append: async () => { if (++calls === 1) throw new Error('private path'); },
        warn: () => warnings++ });
    assert.equal(await audit.publish([record]), false);
    assert.equal(await audit.publish([record]), true);
    assert.equal(warnings, 1);
});

function transactionFixture(transaction, publishAudit) {
    let attempt = 0;
    return { connection: { transaction }, users: { updateOne: async () => ({ matchedCount: 1 }) },
        activities: { create: async () => [{ ...record, _id: `attempt${++attempt}` }] }, publishAudit };
}
const work = async context => {
    await context.recordActivity({ task: 'task', action: 'create', message: 'Title' });
    return 'saved';
};

test('publishes only final attempt after successful commit', async () => {
    const events = [];
    const deps = transactionFixture(async callback => {
        await callback({}); // Simulated aborted attempt.
        const result = await callback({});
        events.push('commit');
        return result;
    }, async rows => events.push(rows.map(row => row._id)));
    assert.equal(await runWorkspaceTransaction('owner', work, deps), 'saved');
    assert.deepEqual(events, ['commit', ['attempt2']]);
});

test('transaction failure emits nothing', async () => {
    const deps = transactionFixture(async callback => {
        await callback({}); throw new Error('commit failed');
    }, () => assert.fail('must not publish'));
    await assert.rejects(runWorkspaceTransaction('owner', work, deps), /commit failed/);
});

test('secondary logging failure preserves the committed result', async () => {
    const deps = transactionFixture(callback => callback({}), async () => false);
    assert.equal(await runWorkspaceTransaction('owner', work, deps), 'saved');
});
