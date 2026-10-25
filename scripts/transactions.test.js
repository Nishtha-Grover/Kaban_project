import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkspaceTransaction } from '../server/services/transactions.js';
import { User } from '../server/models/User.js';

function fixture() {
    const events = [];
    const session = { id: 'test-session' };
    const model = Object.fromEntries(['find', 'findOne', 'countDocuments', 'exists', 'deleteOne']
        .map(method => [method, filter => ({ session(actual) {
            assert.equal(actual, session);
            events.push(method);
            return Promise.resolve(filter);
        } })]));
    const dependencies = {
        users: { async updateOne(filter, update, options) {
            assert.deepEqual(filter, { _id: 'owner' });
            assert.deepEqual(update, { $inc: { workspaceRevision: 1 } });
            assert.equal(options.session, session);
            events.push('lock');
            return { matchedCount: 1 };
        } }, tasks: model, attachments: model,
        connection: { async transaction(callback, options) {
            assert.equal(options.readConcern.level, 'snapshot');
            try {
                const result = await callback(session);
                events.push('commit');
                return result;
            } catch (error) { events.push('abort'); throw error; }
        } }
    };
    return { events, session, dependencies };
}

test('workspace write precedes queries; all operations share the session', async () => {
    const { events, session, dependencies } = fixture();
    const result = await runWorkspaceTransaction('owner', async context => {
        for (const method of ['find', 'findOne', 'countDocuments', 'exists', 'deleteOne']) {
            await context.tasks[method]({ owner: 'owner' });
        }
        await context.attachments.exists({ owner: 'owner' });
        await context.countDependencies({ owner: 'owner' });
        await context.saveTask({ async save(options) {
            assert.equal(options.session, session); events.push('save');
        } });
        return 'saved';
    }, dependencies);
    assert.equal(result, 'saved');
    assert.equal(events[0], 'lock');
    assert.deepEqual(events.slice(-2), ['save', 'commit']);
});

test('callback failure propagates to transaction without a success result', async () => {
    const { events, dependencies } = fixture();
    const failure = new Error('invalid dependency');
    await assert.rejects(runWorkspaceTransaction('owner', async () => { throw failure; }, dependencies),
        error => error === failure);
    assert.deepEqual(events, ['lock', 'abort']);
});

test('missing workspace prevents task work', async () => {
    const { dependencies } = fixture();
    dependencies.users.updateOne = async () => ({ matchedCount: 0 });
    await assert.rejects(runWorkspaceTransaction('owner', () => assert.fail('must not run'), dependencies),
        { code: 'WORKSPACE_UNAVAILABLE', status: 401 });
});

test('retry repeats the workspace lock before rerunning callback', async () => {
    const { events, session, dependencies } = fixture();
    dependencies.connection.transaction = async callback => {
        await callback(session);
        return callback(session);
    };
    await runWorkspaceTransaction('owner', async () => events.push('work'), dependencies);
    assert.deepEqual(events, ['lock', 'work', 'lock', 'work']);
});

test('unsupported database gets actionable error, without nontransactional fallback', async () => {
    const { dependencies } = fixture();
    dependencies.connection.transaction = async () => { throw { code: 20 }; };
    await assert.rejects(runWorkspaceTransaction('owner', () => assert.fail('must not run'), dependencies),
        { code: 'TRANSACTIONS_REQUIRED', status: 503 });
});

test('workspace revision is internal', () => {
    const user = new User({ username: 'student', workspaceRevision: 42 });
    assert.equal(user.toJSON().workspaceRevision, undefined);
    assert.equal(user.toObject().workspaceRevision, undefined);
});
