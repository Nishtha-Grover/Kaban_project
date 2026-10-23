import test from 'node:test';
import assert from 'node:assert/strict';
import { seedDemo, exportWorkspace, EXPORT_LIMIT } from '../server/services/studioData.js';
import { User } from '../server/models/User.js';

test('seeding adds a dependency diamond using generated IDs in order', async () => {
    const inputs = [];
    const context = { claimDemoSeed: async () => true };
    const result = await seedDemo('owner', context, { mutate: async (action, owner, id, input, ctx) => {
        assert.equal(action, 'create'); assert.equal(owner, 'owner'); assert.equal(ctx, context);
        inputs.push(input); return { id: `task${inputs.length}` };
    } });
    assert.equal(result.created, 4);
    assert.deepEqual(inputs.map(input => input.dependsOn), [[], ['task1'], ['task1'], ['task2', 'task3']]);
});
test('repeat seeding is a no-op and failures propagate to transaction', async () => {
    assert.deepEqual(await seedDemo('owner', { claimDemoSeed: async () => false },
        { mutate: () => assert.fail('must not create') }), { created: 0, alreadySeeded: true });
    await assert.rejects(seedDemo('owner', { claimDemoSeed: async () => true },
        { mutate: async () => { throw new Error('save failed'); } }), /save failed/);
});
function exportModel(filter, session, rows) {
    const query = {};
    query.select = () => query;
    query.session = actual => { assert.equal(actual, session); return query; };
    query.sort = () => query;
    query.limit = value => { assert.equal(value, EXPORT_LIMIT + 1); return query; };
    query.lean = async () => rows;
    return { find(actual) { assert.deepEqual(actual, filter); return query; } };
}
test('export scopes every collection and excludes secret/internal fields', async () => {
    const session = {};
    const row = { _id: 'id', title: 'Task', username: 'user', passwordHash: 'secret', data: 'bytes',
        storageKey: 'private', demoSeedVersion: 1, workspaceRevision: 10 };
    const deps = Object.fromEntries(['users', 'tasks', 'activities', 'attachments'].map(name =>
        [name, exportModel(name === 'users' ? { _id: 'owner' } : { owner: 'owner' }, session, [row])]));
    const result = await exportWorkspace('owner', { session }, deps);
    assert.equal(result.includesFileBytes, false);
    for (const records of Object.values(result.collections)) {
        for (const field of ['passwordHash', 'data', 'storageKey', 'demoSeedVersion', 'workspaceRevision']) assert.equal(Object.hasOwn(records[0], field), false);
    }
});
test('oversized export fails instead of truncating records', async () => {
    const session = {};
    await assert.rejects(exportWorkspace('owner', { session }, {
        users: exportModel({ _id: 'owner' }, session, Array(EXPORT_LIMIT + 1).fill({}))
    }), { code: 'EXPORT_TOO_LARGE' });
});
test('demo seed marker is excluded from public user serialization', () => {
    const user = new User({ username: 'student', demoSeedVersion: 1 });
    assert.equal(user.toJSON().demoSeedVersion, undefined);
    assert.equal(user.toObject().demoSeedVersion, undefined);
});
