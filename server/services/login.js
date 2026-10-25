import bcrypt from 'bcrypt';
import { User } from '../models/User.js';

// Compare a real bcrypt hash even when no account exists, to reduce timing differences.
let dummyHash;
function invalidCredentials() {
    return Object.assign(new Error('Invalid username or password.'), { status: 401, code: 'INVALID_CREDENTIALS' });
}

export async function loginUser(input, { users = User } = {}) {
    const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : '';
    const password = input?.password;
    if (!/^[a-z0-9_-]{3,32}$/.test(username) || typeof password !== 'string' ||
        password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) throw invalidCredentials();
    const user = await users.findOne({ username }).select('+passwordHash');
    dummyHash ??= bcrypt.hash('flowforge dummy comparison password', 12);
    const matches = await bcrypt.compare(password, user?.passwordHash || await dummyHash);
    if (!user || !matches) throw invalidCredentials();
    return { id: String(user._id), username: user.username, displayName: user.displayName };
}
