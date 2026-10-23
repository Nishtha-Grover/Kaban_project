import { Router } from 'express';
import { databaseReady } from '../database.js';
import { registerUser } from '../services/registration.js';

export const authRouter = Router();
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
