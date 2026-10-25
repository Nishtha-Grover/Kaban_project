import test from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../server/models/User.js';

// Format-only fixture. No password is hashed or authenticated by these tests.
const passwordHash = '$2b$12$' + 'a'.repeat(53);

test('normalizes usernames and validates a user without a database', async () => {
    const user = new User({ username: '  Student_01  ', displayName: ' Student ', passwordHash });
    await user.validate();
    assert.equal(user.username, 'student_01');
    assert.equal(user.displayName, 'Student');
});

test('rejects missing/invalid usernames and plaintext password hashes', async () => {
    for (const username of [undefined, 'ab', 'with spaces', 'x'.repeat(33)]) {
        await assert.rejects(new User({ username, passwordHash }).validate());
    }
    await assert.rejects(new User({ username: 'student', passwordHash: 'plaintext' }).validate());
    await assert.rejects(new User({ username: 'student' }).validate());
});

test('excludes hashes from ordinary queries and serialized output', () => {
    const user = new User({ username: 'student', passwordHash });
    assert.equal(User.schema.path('passwordHash').options.select, false);
    assert.equal(user.toJSON().passwordHash, undefined);
    assert.equal(user.toObject().passwordHash, undefined);
    assert.ok(!JSON.stringify(user).includes(passwordHash));
});

test('declares timestamps and a unique username index; rejects unknown fields', () => {
    assert.ok(User.schema.path('createdAt'));
    assert.ok(User.schema.path('updatedAt'));
    assert.ok(User.schema.indexes().some(([keys, options]) => keys.username === 1 && options.unique));
    assert.throws(() => new User({ username: 'student', passwordHash, role: 'admin' }), /strict/i);
});
