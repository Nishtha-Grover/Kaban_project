import test from 'node:test';
import assert from 'node:assert/strict';
import { mutateTaskWithAudit } from '../server/services/taskAudit.js';
import { runWorkspaceTransaction } from '../server/services/transactions.js';

const id = 'a'.repeat(24);
function fixture() {
    const records = [];
    const context = {
        tasks: { async findOne(filter) {
            assert.deepEqual(filter, { _id: id, owner: 'owner' });
            return { title: 'Original title', status: 'todo' };
        } },
        async recordActivity(record) { records.push(record); }
    };
    return { records, context };
}

test('creates one server-generated record without trusting client audit fields', async () => {
    const { context, records } = fixture();
    const result = { id, title: 'New task', status: 'todo' };
    assert.equal(await mutateTaskWithAudit('create', 'owner', null,
        { message: 'spoof', owner: 'other' }, context, { create: async () => result }), result);
    assert.deepEqual(records, [{ task: id, action: 'create', message: 'Created task: New task' }]);
});

test('distinguishes status transitions from ordinary edits', async () => {
    for (const [status, action] of [['done', 'move'], ['todo', 'edit']]) {
        const { context, records } = fixture();
        await mutateTaskWithAudit('update', 'owner', id, {}, context,
            { update: async () => ({ id, title: 'Renamed', status }) });
        assert.equal(records.length, 1);
        assert.equal(records[0].action, action);
        assert.ok(records[0].message.includes('Renamed'));
        if (action === 'move') assert.ok(records[0].message.includes('todo → done'));
    }
});

test('delete retains the title snapshot after task removal', async () => {
    const { context, records } = fixture();
    await mutateTaskWithAudit('delete', 'owner', id, {}, context, { remove: async () => {} });
    assert.deepEqual(records, [{ task: id, action: 'delete', message: 'Deleted task: Original title' }]);
});

test('rejected mutations produce no record, and audit failures propagate', async () => {
    const { context, records } = fixture();
    const rejected = new Error('stale version');
    await assert.rejects(mutateTaskWithAudit('update', 'owner', id, {}, context,
        { update: async () => { throw rejected; } }), error => error === rejected);
    assert.equal(records.length, 0);
    context.recordActivity = async () => { throw new Error('audit unavailable'); };
    await assert.rejects(mutateTaskWithAudit('delete', 'owner', id, {}, context,
        { remove: async () => {} }), /audit unavailable/);
});

test('invalid IDs and missing audit writer fail before task work', async () => {
    const { context } = fixture();
    await assert.rejects(mutateTaskWithAudit('delete', 'owner', 'bad', {}, context), { code: 'TASK_VALIDATION' });
    await assert.rejects(mutateTaskWithAudit('create', 'owner', null, {}, {}), /audit writer required/);
});

test('audit insert uses transaction session and authoritative owner; failure reaches abort', async () => {
    const session = {};
    const events = [];
    await assert.rejects(runWorkspaceTransaction('owner', context => context.recordActivity({
        owner: 'spoof', task: id, action: 'delete', message: 'Deleted task: Example'
    }), {
        connection: { async transaction(work) {
            try { await work(session); events.push('commit'); }
            catch (error) { events.push('abort'); throw error; }
        } },
        users: { updateOne: async () => ({ matchedCount: 1 }) },
        activities: { async create(rows, options) {
            assert.equal(options.session, session);
            assert.equal(rows[0].owner, 'owner');
            events.push('audit');
            throw new Error('database write failed');
        } }
    }), /database write failed/);
    assert.deepEqual(events, ['audit', 'abort']);
});
