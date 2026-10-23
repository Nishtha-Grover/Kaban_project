import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreDocuments, relationshipOptions } from '../server/services/explorer.js';

function fixture(rows) {
    const populated = [], query = {};
    for (const name of ['select', 'sort', 'skip', 'limit']) query[name] = () => query;
    query.populate = option => { populated.push(option); return query; };
    query.lean = async () => rows;
    return { populated, model: { find(filter) { assert.deepEqual(filter, { owner: 'owner' }); return query; }, countDocuments: async () => rows.length } };
}
test('populate paths enforce owner matching and narrow projections', () => {
    assert.deepEqual(relationshipOptions('owner', 'users'), []);
    for (const name of ['tasks', 'activities', 'attachments', 'blobs']) {
        const options = relationshipOptions('owner', name);
        assert.deepEqual(options[0], { path: 'owner', select: '_id username displayName', match: { _id: 'owner' } });
        if (name !== 'blobs') assert.deepEqual(options[1], {
            path: name === 'tasks' ? 'dependsOn' : 'task', select: '_id owner title status', match: { owner: 'owner' }
        });
    }
});
test('expanded tasks strip nested secrets and omit foreign prerequisites', async () => {
    const { model, populated } = fixture([{ _id: 'task', owner: { _id: 'owner', username: 'student', passwordHash: 'secret' },
        dependsOn: [{ _id: 'good', owner: 'owner', title: 'Report', status: 'done', description: 'private extra' },
            { _id: 'foreign', owner: 'someone-else', title: 'Secret' }, null] }]);
    const result = await exploreDocuments('owner', 'tasks', { expand: 'relationships' }, { models: { tasks: model } });
    assert.equal(result.expanded, true);
    assert.equal(populated.length, 2);
    assert.deepEqual(result.documents[0].owner, { _id: 'owner', username: 'student' });
    assert.deepEqual(result.documents[0].dependsOn, [{ _id: 'good', title: 'Report', status: 'done' }]);
});
test('missing task links remain null while activity history survives', async () => {
    const { model } = fixture([{ _id: 'event', owner: null, task: null, message: 'Deleted task: Report' }]);
    const result = await exploreDocuments('owner', 'activities', { expand: 'relationships' }, { models: { activities: model } });
    assert.equal(result.documents[0].task, null);
    assert.equal(result.documents[0].message, 'Deleted task: Report');
});
test('raw mode preserves reference IDs without populate', async () => {
    const { model, populated } = fixture([{ _id: 'task', owner: 'owner', dependsOn: ['prerequisite'] }]);
    const result = await exploreDocuments('owner', 'tasks', {}, { models: { tasks: model } });
    assert.equal(result.expanded, false);
    assert.deepEqual(populated, []);
    assert.deepEqual(result.documents[0].dependsOn, ['prerequisite']);
});
test('caller cannot choose arbitrary populate paths', async () => {
    for (const expand of ['passwordHash', 'owner', { path: 'owner' }, ['relationships']]) {
        await assert.rejects(exploreDocuments('owner', 'tasks', { expand }), { code: 'EXPLORER_INVALID' });
    }
});
