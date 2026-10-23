// Server-only configuration. Never serve this directory as static content.
export function readConfig(env = process.env) {
    const mode = env.NODE_ENV || 'development';
    if (!['development', 'test', 'production'].includes(mode)) {
        throw new Error('NODE_ENV must be development, test or production.');
    }
    const portText = env.PORT || '3000';
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT must be a whole number from 1 to 65535.');
    }
    const host = (env.HOST || '127.0.0.1').trim();
    if (!host || /[\s/]/.test(host)) throw new Error('HOST must be a hostname or IP address.');
    const mongoUri = (env.MONGODB_URI || '').trim();
    if (mongoUri && !/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
        throw new Error('MONGODB_URI must begin with mongodb:// or mongodb+srv://.');
    }
    const jwtSecret = env.JWT_SECRET || '';
    if (jwtSecret && jwtSecret.length < 32) {
        throw new Error('JWT_SECRET must contain at least 32 characters when configured.');
    }
    if (mode === 'production' && (!mongoUri || !jwtSecret)) {
        throw new Error('Production requires MONGODB_URI and JWT_SECRET.');
    }
    return Object.freeze({ mode, port, host, mongoUri, jwtSecret });
}
