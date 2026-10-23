import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { exploreDocuments } from '../services/explorer.js';

export const studioRouter = Router();
studioRouter.use(requireAuth);
studioRouter.get('/collections/:collection', async (req, res, next) => {
    try { res.json(await exploreDocuments(req.user.id, req.params.collection, req.query)); }
    catch (error) {
        if (error.code === 'EXPLORER_INVALID') return res.status(400).json({ error: { code: error.code, message: error.message } });
        next(error);
    }
});
