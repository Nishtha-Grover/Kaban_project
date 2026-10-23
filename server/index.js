import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './database.js';
import { readConfig } from './config.js';

let config;
try {
    config = readConfig();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

try {
    await connectDatabase(config.mongoUri);
} catch {
    console.error('MongoDB connection or index creation failed. Check MONGODB_URI and database access.');
    await disconnectDatabase();
    process.exit(1);
}

const server = createServer(createApp());
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Stop the other server or change PORT in .env.`
        : `Server could not start (${error.code || 'unknown error'}). Check HOST and PORT.`);
    disconnectDatabase().finally(() => { process.exitCode = 1; });
});
server.listen(config.port, config.host, () => {
    console.log(`FlowForge API listening on ${config.host}:${config.port}`);
    console.log('Health endpoint: /api/health. Check it for database connection status.');
});

let stopping = false;
function shutdown() {
    if (stopping) return;
    stopping = true;
    console.log('Stopping FlowForge API…');
    const deadline = setTimeout(() => {
        server.closeAllConnections();
        process.exit(1);
    }, 10000);
    deadline.unref();
    server.close(async () => {
        await disconnectDatabase();
        clearTimeout(deadline);
        process.exitCode = 0;
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
