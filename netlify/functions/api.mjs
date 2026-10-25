import serverless from 'serverless-http';
import { createApp } from '../../server/app.js';
import { connectDatabase, databaseReady } from '../../server/database.js';
import { readConfig } from '../../server/config.js';

const respond = serverless(createApp({ serveFrontend: false, attachmentLimit: 3 * 1024 * 1024 }), {
    binary: ['application/octet-stream']
});
let connection;
export async function handler(event, context = {}) {
    context.callbackWaitsForEmptyEventLoop = false;
    try {
        // Cookies must always be secure on the hosted HTTPS site.
        process.env.NODE_ENV = 'production';
        const config = readConfig();
        if (!databaseReady()) {
            connection ||= connectDatabase(config.mongoUri).catch(error => { connection = null; throw error; });
            await connection;
            if (!databaseReady()) { connection = null; throw new Error('Database unavailable'); }
        }
        const path = event.path.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '/api');
        return await respond({ ...event, path }, context);
    } catch {
        return { statusCode: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database connection unavailable. Please try again shortly.' } }) };
    }
}
