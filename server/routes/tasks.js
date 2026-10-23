import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createTask, listTasks } from '../services/tasks.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res, next) => {
    try { res.json(await listTasks(req.user.id, req.query)); }
    catch (error) { next(error); }
});

tasksRouter.post('/', async (req, res, next) => {
    if (req.get('Sec-Fetch-Site') === 'cross-site') {
        return res.status(403).json({ error: { code: 'CROSS_SITE', message: 'Use this application to change tasks.' } });
    }
    if (!req.is('application/json')) {
        return res.status(415).json({ error: { code: 'JSON_REQUIRED', message: 'Send an application/json request.' } });
    }
    try { res.status(201).json({ task: await createTask(req.user.id, req.body) }); }
    catch (error) { next(error); }
});

tasksRouter.use((error, req, res, next) => {
    if (error.code === 'TASK_VALIDATION') {
        return res.status(400).json({ error: { code: error.code, message: error.message } });
    }
    next(error);
});
