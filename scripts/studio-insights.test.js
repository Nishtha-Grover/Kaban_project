import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { taskInsightsPipeline, studioInsights } from '../server/services/studioInsights.js';
const owner = 'a'.repeat(24);
function fixture(rows, installed = []) {
    return { aggregate(pipeline) {
        assert.equal(String(pipeline[0].$match.owner), owner);
        return { option(options) { assert.equal(options.maxTimeMS, 5000); return Promise.resolve(rows); } };
    }, listIndexes: async () => installed, schema: { indexes: () => [[{ owner: 1, status: 1 }, {}], [{ owner: 1, dueDate: 1 }, {}]] } };
}
test('aggregation starts with typed authenticated owner and bounds category output', () => {
    const pipeline = taskInsightsPipeline(owner);
    assert.ok(pipeline[0].$match.owner instanceof mongoose.Types.ObjectId);
    assert.deepEqual(pipeline[1].$facet.categories.at(-1), { $limit: 5 });
    assert.throws(() => taskInsightsPipeline({ $ne: null }));
});
test('empty workspace returns zero metrics without fabricated data', async () => {
    const result = await studioInsights(owner, { tasks: fixture([{ totals: [], statuses: [], priorities: [], categories: [] }]) });
    assert.equal(result.total, 0); assert.equal(result.completionPercent, 0);
    assert.deepEqual(result.categories, []);
    assert.ok(result.indexes.every(index => !index.installed));
});
test('reports aggregation values and verifies installed index definitions', async () => {
    const result = await studioInsights(owner, { tasks: fixture([{ totals: [{ total: 3, completed: 1, dependencyLinks: 2 }],
        statuses: [{ _id: 'done', count: 1 }], priorities: [], categories: [] }],
    [{ key: { owner: 1, status: 1 } }, { key: { dueDate: 1, owner: 1 } }]) });
    assert.equal(result.completionPercent, 33); assert.equal(result.dependencyLinks, 2);
    assert.equal(result.indexes[0].installed, true);
    assert.equal(result.indexes[1].installed, false); // Order matters for compound indexes.
});
test('database failure is propagated instead of reporting zero statistics', async () => {
    const tasks = fixture([]); tasks.listIndexes = async () => { throw new Error('unavailable'); };
    await assert.rejects(studioInsights(owner, { tasks }), /unavailable/);
});
