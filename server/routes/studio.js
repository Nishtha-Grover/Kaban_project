import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { exploreDocuments } from '../services/explorer.js';
import { studioInsights } from '../services/studioInsights.js';
import { runWorkspaceTransaction } from '../services/transactions.js';
import { seedDemo, exportWorkspace } from '../services/studioData.js';

export const studioRouter = Router();
studioRouter.use(requireAuth);
studioRouter.post('/seed', async (req, res, next) => {
    try {
        if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: { message: 'Use this application to add demo tasks.' } });
        if (!req.is('application/json')) return res.status(415).json({ error: { message: 'Send application/json.' } });
        if (Object.keys(req.query).length || !req.body || Array.isArray(req.body) || Object.keys(req.body).length) {
            return res.status(400).json({ error: { message: 'Send an empty JSON object.' } });
        }
        const result = await runWorkspaceTransaction(req.user.id, context => seedDemo(req.user.id, context));
        res.status(result.created ? 201 : 200).json(result);
    } catch (error) { next(error); }
});
studioRouter.get('/export', async (req, res, next) => {
    try {
        if (Object.keys(req.query).length) return res.status(400).json({ error: { message: 'Export does not accept query parameters.' } });
        const result = await runWorkspaceTransaction(req.user.id, context => exportWorkspace(req.user.id, context));
        res.attachment('flowforge-workspace.json').type('application/json').set('X-Content-Type-Options', 'nosniff').send(JSON.stringify(result, null, 2));
    } catch (error) { next(error); }
});
studioRouter.get('/insights', async (req, res, next) => {
    try {
        if (Object.keys(req.query).length) return res.status(400).json({ error: { code: 'INSIGHTS_INVALID', message: 'This report does not accept query parameters.' } });
        res.json(await studioInsights(req.user.id));
    } catch (error) { next(error); }
});
studioRouter.get('/collections/:collection', async (req, res, next) => {
    try { res.json(await exploreDocuments(req.user.id, req.params.collection, req.query)); }
    catch (error) {
        if (error.code === 'EXPLORER_INVALID') return res.status(400).json({ error: { code: error.code, message: error.message } });
        next(error);
    }
});
studioRouter.use((error, req, res, next) => {
    if (['EXPORT_TOO_LARGE', 'TRANSACTIONS_REQUIRED', 'WORKSPACE_UNAVAILABLE'].includes(error.code)) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    next(error);
});
