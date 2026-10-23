import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreDocuments } from '../server/services/explorer.js';

function model(expectedFilter) {
    const calls = {};
    const query = {};
    for (const method of ['select', 'sort', 'skip', 'limit']) query[method] = value => { calls[method] = value; return query; };
    query.lean = async () => [{ _id: 'id', username: 'student', title: 'Task', owner: 'owner',
        passwordHash: 'secret', workspaceRevision: 7, storageKey: 'private', data: Buffer.from('private'), createdAt: 'date' }];
    return { calls, find(filter) { assert.deepEqual(filter, expectedFilter); return query; },
        async countDocuments(filter) { assert.deepEqual(filter, expectedFilter); return 23; } };
}
test('each collection is owner-scoped with explicit projection and response filtering', async () => {
    for (const collection of ['users', 'tasks', 'activities', 'attachments', 'blobs']) {
        const mock = model(collection === 'users' ? { _id: 'owner' } : { owner: 'owner' });
        const result = await exploreDocuments('owner', collection, {}, { models: { [collection]: mock } });
        for (const key of ['passwordHash', 'workspaceRevision', 'storageKey', 'data']) {
            assert.equal(Object.hasOwn(result.documents[0], key), false);
            assert.equal(mock.calls.select.split(' ').includes(key), false);
        }
        assert.equal(result.totalPages, 3);
        assert.equal(mock.calls.limit, 10);
    }
});
test('pagination is bounded and stable', async () => {
    const mock = model({ owner: 'owner' });
    const result = await exploreDocuments('owner', 'tasks', { page: '2', limit: '5' }, { models: { tasks: mock } });
    assert.equal(mock.calls.skip, 5);
    assert.deepEqual(mock.calls.sort, { createdAt: -1, _id: -1 });
    assert.equal(result.totalPages, 5);
});
test('rejects arbitrary collections and injected query filters', async () => {
    for (const collection of ['__proto__', 'constructor', 'sessions', '../users']) {
        await assert.rejects(exploreDocuments('owner', collection), { code: 'EXPLORER_INVALID' });
    }
    for (const query of [{ owner: 'other' }, { page: '0' }, { limit: '51' }, { page: { $gt: 1 } }, { limit: ['10'] }]) {
        await assert.rejects(exploreDocuments('owner', 'tasks', query), { code: 'EXPLORER_INVALID' });
    }
});
