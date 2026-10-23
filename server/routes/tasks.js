import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listTasks } from '../services/tasks.js';
import { mutateTaskWithAudit } from '../services/taskAudit.js';
import { runWorkspaceTransaction } from '../services/transactions.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res, next) => {
    try { res.json(await listTasks(req.user.id, req.query)); }
    catch (error) { next(error); }
});

tasksRouter.use((req, res, next) => {
    if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (req.get('Sec-Fetch-Site') === 'cross-site') {
        return res.status(403).json({ error: { code: 'CROSS_SITE', message: 'Use this application to change tasks.' } });
    }
    if (!req.is('application/json')) {
        return res.status(415).json({ error: { code: 'JSON_REQUIRED', message: 'Send an application/json request.' } });
    }
    next();
});

tasksRouter.post('/', async (req, res, next) => {
    try { res.status(201).json({ task: await runWorkspaceTransaction(req.user.id,
        context => mutateTaskWithAudit('create', req.user.id, null, req.body, context)) }); }
    catch (error) { next(error); }
});

tasksRouter.patch('/:id', async (req, res, next) => {
    try { res.json({ task: await runWorkspaceTransaction(req.user.id,
        context => mutateTaskWithAudit('update', req.user.id, req.params.id, req.body, context)) }); }
    catch (error) { next(error); }
});

tasksRouter.delete('/:id', async (req, res, next) => {
    try { await runWorkspaceTransaction(req.user.id,
        context => mutateTaskWithAudit('delete', req.user.id, req.params.id, req.body, context)); res.status(204).end(); }
    catch (error) { next(error); }
});

tasksRouter.use((error, req, res, next) => {
    if (['TASK_VALIDATION', 'TASK_CONFLICT', 'TASK_NOT_FOUND', 'WORKSPACE_UNAVAILABLE', 'TRANSACTIONS_REQUIRED'].includes(error.code)) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message,
            ...(error.fields ? { fields: error.fields } : {}) } });
    }
    next(error);
});
