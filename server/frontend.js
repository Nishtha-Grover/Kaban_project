import express from 'express';
import { fileURLToPath } from 'node:url';

export function mountFrontend(app) {
    // Netlify serves static files separately and bundles this module as CommonJS.
    // Resolve the local-only path only when the standalone server mounts pages.
    const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
    const sendOptions = { root: frontendRoot, dotfiles: 'deny', maxAge: 0 };
    // Explicit entry points: never expose the repository root with express.static.
    const pages = ['index.html', 'login.html', 'signup.html', 'board.html', 'studio.html'];
    for (const page of pages) {
        const routes = page === 'index.html' ? ['/', '/index.html'] : [`/${page}`];
        app.get(routes, (req, res, next) => {
            res.set('Cache-Control', 'no-cache');
            res.sendFile(page, sendOptions, error => { if (error) next(error); });
        });
    }
    for (const [folder, extension] of [['css', '.css'], ['js', '.js']]) {
        app.use(`/${folder}`, (req, res, next) => {
            // Only top-level frontend source files are public, not backups or secrets.
            if (!new RegExp(`^/[a-zA-Z0-9_-]+\\${extension}$`).test(req.path)) return next();
            return express.static(`${frontendRoot}${folder}`, {
                dotfiles: 'ignore', index: false, redirect: false, maxAge: 0
            })(req, res, next);
        });
    }
    app.get('/data/student-tasks.json', (req, res, next) => {
        res.sendFile('data/student-tasks.json', sendOptions, error => { if (error) next(error); });
    });
}
