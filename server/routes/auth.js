import { Router } from 'express';
import { databaseReady } from '../database.js';
import { registerUser } from '../services/registration.js';
import { loginUser } from '../services/login.js';
import { issueSession, setSessionCookie, clearSessionCookie } from '../services/session.js';
import { readConfig } from '../config.js';

export const authRouter = Router();
authRouter.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('Sec-Fetch-Site') === 'cross-site') {
        return res.status(403).json({ error: { code: 'CROSS_SITE', message: 'Use this application to sign in or out.' } });
    }
    if (req.method === 'POST' && !req.is('application/json')) {
        return res.status(415).json({ error: { code: 'JSON_REQUIRED', message: 'Send an application/json request.' } });
    }
    next();
});

authRouter.post('/login', async (req, res, next) => {
    const config = readConfig();
    if (!databaseReady() || !config.jwtSecret) {
        return res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Sign-in is not configured yet.' } });
    }
    try {
        const user = await loginUser(req.body);
        const token = await issueSession(user.id, config.jwtSecret);
        setSessionCookie(res, token, config.mode);
        res.json({ user });
    } catch (error) {
        if (error.code === 'INVALID_CREDENTIALS') {
            return res.status(401).json({ error: { code: error.code, message: error.message } });
        }
        next(error);
    }
});

authRouter.post('/logout', (req, res) => {
    clearSessionCookie(res, readConfig().mode);
    res.status(204).end();
});

authRouter.post('/register', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!databaseReady()) {
        return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Registration requires a connected database.' } });
    }
    try {
        const user = await registerUser(req.body);
        res.status(201).json({ user });
    } catch (error) {
        if (['VALIDATION', 'USERNAME_TAKEN'].includes(error.code)) {
            return res.status(error.status).json({ error: { code: error.code, message: error.message } });
        }
        next(error);
    }
});
