import express from 'express';
import { mountFrontend } from './frontend.js';

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '100kb' }));

    app.get('/api/health', (req, res) => {
        res.set('Cache-Control', 'no-store').json({
            status: 'ok', service: 'FlowForge API', database: 'not-connected'
        });
    });

    mountFrontend(app);
    app.use((req, res) => {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    });

    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (error.type === 'entity.parse.failed') {
            return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } });
        }
        if (error.type === 'entity.too.large') {
            return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds 100 KB.' } });
        }
        if (error.status === 404) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found.' } });
        }
        // Do not send stack traces or request bodies to the browser.
        console.error('Unhandled API error:', error.name || 'Error');
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
    });
    return app;
}
