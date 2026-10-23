import { User } from '../models/User.js';
import { databaseReady } from '../database.js';
import { readConfig } from '../config.js';
import { SESSION_COOKIE, verifySession } from '../services/session.js';

export function readSessionCookie(header = '') {
    if (typeof header !== 'string') return null;
    const matches = header.split(';').map(part => part.trim())
        .filter(part => part.slice(0, part.indexOf('=')) === SESSION_COOKIE);
    if (matches.length !== 1) return null;
    try {
        const token = decodeURIComponent(matches[0].slice(matches[0].indexOf('=') + 1));
        return token && token.length <= 4096 ? token : null;
    } catch { return null; }
}

export function createRequireAuth({ users = User, ready = databaseReady, config = readConfig, verify = verifySession } = {}) {
    return async function requireAuth(req, res, next) {
        res.set('Cache-Control', 'no-store');
        const token = readSessionCookie(req.headers.cookie);
        const unauthorized = () => res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please log in to continue.' } });
        if (!token) return unauthorized();
        try {
            const { jwtSecret } = config();
            if (!jwtSecret || !ready()) {
                return res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' } });
            }
            let claims;
            try { claims = await verify(token, jwtSecret); }
            catch { return unauthorized(); }
            const user = await users.findById(claims.sub).select('_id username displayName');
            if (!user) return unauthorized();
            // Identity always comes from a verified session and an existing account.
            req.user = Object.freeze({ id: String(user._id), username: user.username, displayName: user.displayName });
            next();
        } catch (error) { next(error); }
    };
}

export const requireAuth = createRequireAuth();
