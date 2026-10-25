import { User } from '../models/User.js';

function problem(status, code, message) {
    return Object.assign(new Error(message), { status, code });
}
export async function hashPassword(password) {
    const { default: bcrypt } = await import('bcrypt');
    return bcrypt.hash(password, 12);
}

export async function registerUser(input, { users = User, hash = hashPassword } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw problem(400, 'VALIDATION', 'Provide a JSON object with username and password.');
    }
    const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
    const password = input.password;
    const displayName = input.displayName === undefined ? '' : input.displayName;
    if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
        throw problem(400, 'VALIDATION', 'Username must be 3–32 letters, numbers, underscores or hyphens.');
    }
    if (typeof password !== 'string' || password.length < 8 || !password.trim() || Buffer.byteLength(password, 'utf8') > 72) {
        throw problem(400, 'VALIDATION', 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.');
    }
    if (typeof displayName !== 'string' || displayName.trim().length > 80) {
        throw problem(400, 'VALIDATION', 'Display name must be text of at most 80 characters.');
    }
    const passwordHash = await hash(password);
    try {
        const user = await users.create({ username, displayName: displayName.trim(), passwordHash });
        return { id: String(user._id), username: user.username, displayName: user.displayName };
    } catch (error) {
        if (error.code === 11000) throw problem(409, 'USERNAME_TAKEN', 'That username is already registered.');
        throw error;
    }
}
