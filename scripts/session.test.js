import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { loginUser } from '../server/services/login.js';
import { issueSession, verifySession, cookieOptions, setSessionCookie, clearSessionCookie } from '../server/services/session.js';

const id = '507f1f77bcf86cd799439011';
const secret = 'test-only-secret-'.repeat(4);

test('login validates password and returns only public user fields', async () => {
    const passwordHash = await bcrypt.hash('test password', 4);
    const users = { findOne: query => {
        assert.equal(query.username, 'student');
        return { select: async selection => {
            assert.equal(selection, '+passwordHash');
            return { _id: id, username: 'student', displayName: 'Student', passwordHash };
        } };
    } };
    assert.deepEqual(await loginUser({ username: ' Student ', password: 'test password' }, { users }),
        { id, username: 'student', displayName: 'Student' });
    await assert.rejects(loginUser({ username: 'student', password: 'wrong password' }, { users }), error => error.status === 401);
    await assert.rejects(loginUser({ username: 'student', password: 'test password' },
        { users: { findOne: () => ({ select: async () => null }) } }), error => error.status === 401);
});

test('cookie flags and clearing options match', () => {
    assert.deepEqual(cookieOptions('production'), { httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
    assert.equal(cookieOptions('development').secure, false);
    const res = {
        cookie: (name, token, options) => { assert.equal(name, 'flowforge_session'); assert.equal(options.maxAge, 3600000); },
        clearCookie: (name, options) => { assert.equal(name, 'flowforge_session'); assert.deepEqual(options, cookieOptions('production')); }
    };
    setSessionCookie(res, 'token', 'production');
    clearSessionCookie(res, 'production');
});

test('JWT verifies subject and lifetime; rejects wrong secrets and expired tokens', async () => {
    const token = await issueSession(id, secret);
    const claims = await verifySession(token, secret);
    assert.equal(claims.sub, id);
    assert.equal(claims.exp - claims.iat, 3600);
    await assert.rejects(verifySession(token, 'wrong-secret-'.repeat(4)));
    const { default: jwt } = await import('jsonwebtoken');
    for (const options of [
        { algorithm: 'HS256', expiresIn: -1, issuer: 'flowforge', audience: 'flowforge-web' },
        { algorithm: 'HS384', expiresIn: 60, issuer: 'flowforge', audience: 'flowforge-web' },
        { algorithm: 'HS256', expiresIn: 60, issuer: 'other', audience: 'flowforge-web' }
    ]) {
        await assert.rejects(verifySession(jwt.sign({}, secret, { subject: id, ...options }), secret));
    }
});
