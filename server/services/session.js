export const SESSION_COOKIE = 'flowforge_session';
const lifetimeSeconds = 3600;
const issuer = 'flowforge';
const audience = 'flowforge-web';

export function cookieOptions(mode) {
    return { httpOnly: true, secure: mode === 'production', sameSite: 'strict', path: '/' };
}

export async function issueSession(userId, secret) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('JWT secret is not configured.');
    const { default: jwt } = await import('jsonwebtoken');
    return jwt.sign({}, secret, {
        algorithm: 'HS256', subject: String(userId), issuer, audience, expiresIn: lifetimeSeconds
    });
}

export async function verifySession(token, secret) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('JWT secret is not configured.');
    const { default: jwt } = await import('jsonwebtoken');
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
    if (typeof claims.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(claims.sub)) throw new Error('Invalid session subject.');
    return claims;
}

export function setSessionCookie(res, token, mode) {
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions(mode), maxAge: lifetimeSeconds * 1000 });
}

export function clearSessionCookie(res, mode) {
    res.clearCookie(SESSION_COOKIE, cookieOptions(mode));
}
