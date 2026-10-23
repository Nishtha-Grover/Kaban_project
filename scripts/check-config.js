import { readConfig } from '../server/config.js';
try {
    const config = readConfig();
    console.log(`Configuration valid: ${config.mode}, ${config.host}:${config.port}.`);
    console.log(`MongoDB: ${config.mongoUri ? 'configured' : 'not configured yet'}. JWT secret: ${config.jwtSecret ? 'configured' : 'not configured yet'}.`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
