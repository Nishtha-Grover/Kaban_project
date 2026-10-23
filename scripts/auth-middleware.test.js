import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth, readSessionCookie } from '../server/middleware/auth.js';
import { requireOwnedDocument } from '../server/middleware/owner.js';
import { issueSession } from '../server/services/session.js';

const id = '507f1f77bcf86cd799439011';
const otherId = '507f1f77bcf86cd799439012';
const secret = 'middleware-test-secret-'.repeat(3);
function response() {
    return { locals: {}, statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function authFor(user) {
    return createRequireAuth({ ready: () => true, config: () => ({ jwtSecret: secret }), users: {
        findById: value => { assert.equal(value, id); return { select: async () => user }; }
    } });
}

test('cookie parsing rejects malformed and ambiguous cookies', () => {
    assert.equal(readSessionCookie('other=value; flowforge_session=abc'), 'abc');
    for (const value of ['', 'flowforge_session=%ZZ', 'flowforge_session=a; flowforge_session=b']) assert.equal(readSessionCookie(value), null);
});
test('authentication rejects absent and tampered sessions', async () => {
    for (const cookie of ['', 'flowforge_session=invalid.token']) {
        const res = response();
        await authFor(null)({ headers: { cookie } }, res, () => assert.fail('Must not allow access'));
        assert.equal(res.statusCode, 401);
    }
});
test('verified identity overrides supplied fields and deleted accounts are rejected', async () => {
    const token = await issueSession(id, secret);
    const req = { headers: { cookie: `flowforge_session=${token}` }, body: { owner: otherId }, user: { id: otherId } };
    let passed = false;
    await authFor({ _id: id, username: 'student', displayName: 'Student' })(req, response(), () => passed = true);
    assert.ok(passed);
    assert.equal(req.user.id, id);
    const res = response();
    await authFor(null)(req, res, () => assert.fail('Deleted account must fail'));
    assert.equal(res.statusCode, 401);
});
test('owner lookup scopes by authenticated user, not request body', async () => {
    const req = { user: { id }, params: { id: otherId }, body: { owner: otherId } };
    const document = { _id: otherId, owner: id };
    const res = response();
    await requireOwnedDocument({ findOne: async query => {
        assert.deepEqual(query, { _id: otherId, owner: id }); return document;
    } })(req, res, error => { assert.equal(error, undefined); });
    assert.equal(res.locals.ownedDocument, document);
    const missing = response();
    await requireOwnedDocument({ findOne: async () => null })(req, missing, () => assert.fail());
    assert.equal(missing.statusCode, 404);
});
test('owner middleware rejects missing authentication and invalid IDs before querying', async () => {
    const guard = requireOwnedDocument({ findOne: () => assert.fail('Must not query') });
    for (const [req, expected] of [[{params:{id}},401], [{user:{id},params:{id:'bad'}},400]]) {
        const res = response(); await guard(req, res, () => assert.fail()); assert.equal(res.statusCode,expected);
    }
});
