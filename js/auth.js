/**
 * Simulated client-side authentication for Phase 1.
 * 
 * WARNING: Authentication is simulated entirely client-side using localStorage.
 * Passwords are saved in plain text. This is explicitly for Phase 1 simulation only.
 * Real server-side authentication (JWT, hashed passwords) will be implemented in Phase 2
 * once Express + MongoDB are introduced.
 */

const USERS_KEY = 'kanban-users';
const SESSION_KEY = 'kanban-session';

/**
 * Get all registered users.
 * @returns {Object} users object { username: { username, password, createdAt } }
 */
function getUsers() {
    try {
        const saved = localStorage.getItem(USERS_KEY);
        if (saved === null) return Object.create(null);
        const users = JSON.parse(saved);
        if (!users || typeof users !== 'object' || Array.isArray(users)) {
            throw new Error('Invalid account storage');
        }
        for (const [name, user] of Object.entries(users)) {
            if (!user || typeof user !== 'object' || user.username !== name || typeof user.password !== 'string') {
                throw new Error('Invalid account record');
            }
        }
        return Object.assign(Object.create(null), users);
    } catch (e) {
        // Do not replace unreadable existing accounts with an empty registry.
        throw new Error('Saved accounts could not be read. Check browser storage settings. Existing data has not been replaced.');
    }
}

/**
 * Save users back to localStorage
 */
function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Attempt to register a new user.
 * @param {string} username 
 * @param {string} password 
 * @returns {Object} { success: boolean, error?: string }
 */
export function registerUser(username, password) {
    if (!username || username.trim().length < 3) {
        return { success: false, error: 'Username must be at least 3 characters long.' };
    }
    if (!password || password.length < 3) {
        return { success: false, error: 'Password must be at least 3 characters long.' };
    }

    const trimmedUsername = username.trim();
    let users;
    try {
        users = getUsers();
    } catch (error) {
        return { success: false, error: error.message };
    }

    if (users[trimmedUsername]) {
        return { success: false, error: 'Username already exists. Please choose another.' };
    }

    users[trimmedUsername] = {
        username: trimmedUsername,
        password: password, // Plaintext, Phase 1 only!
        createdAt: new Date().toISOString()
    };

    try {
        saveUsers(users);
    } catch {
        return { success: false, error: 'Account could not be saved. Browser storage may be full or disabled. Please try again.' };
    }
    const session = loginUser(trimmedUsername, password);
    if (!session.success) {
        return { success: false, error: 'Your account was saved, but sign-in failed. Enable browser storage and log in with this account.' };
    }
    return session;
}

/**
 * Attempt to log in a user.
 * @param {string} username 
 * @param {string} password 
 * @returns {Object} { success: boolean, error?: string }
 */
export function loginUser(username, password) {
    const trimmedUsername = (username || '').trim();
    let users;
    try {
        users = getUsers();
    } catch (error) {
        return { success: false, error: error.message };
    }
    const user = users[trimmedUsername];

    if (!user) {
        return { success: false, error: 'Invalid username or password.' };
    }
    
    if (user.password !== password) {
        return { success: false, error: 'Invalid username or password.' };
    }

    // Set active session
    try {
        localStorage.setItem(SESSION_KEY, trimmedUsername);
    } catch {
        return { success: false, error: 'Could not save your login session. Enable browser storage and try again.' };
    }
    return { success: true };
}

/**
 * Log out the current user.
 */
export function logoutUser() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // Still leave the workspace when the browser blocks storage access.
    }
    window.location.replace('index.html');
}

/**
 * Get the currently logged-in username.
 * @returns {string|null}
 */
export function getSessionUsername() {
    try {
        const username = localStorage.getItem(SESSION_KEY);
        if (!username) return null;
        const users = getUsers();
        if (Object.hasOwn(users, username)) return username;
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // An unreadable session is treated as signed out.
    }
    return null;
}

let sessionWatcherInstalled = false;

function watchWorkspaceSession(username) {
    if (sessionWatcherInstalled) return;
    sessionWatcherInstalled = true;
    const check = () => {
        const current = getSessionUsername();
        if (current !== username) {
            // Prevent the old account's board being used during navigation.
            document.documentElement.style.visibility = 'hidden';
            window.location.replace(current ? 'board.html' : 'login.html');
        }
    };
    window.addEventListener('storage', event => {
        if (event.key === SESSION_KEY || event.key === USERS_KEY || event.key === null) check();
    });
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
}

/**
 * Call this on protected pages (like board.html)
 * Redirects to login.html if no session exists.
 */
export function requireAuth() {
    const session = getSessionUsername();
    if (!session) {
        window.location.replace('login.html');
        return false;
    }
    watchWorkspaceSession(session);
    return true;
}

/**
 * Call this on public auth pages (index, login, signup)
 * Redirects to board.html if a session ALREADY exists.
 */
export function requireNoAuth() {
    const session = getSessionUsername();
    if (session) {
        window.location.replace('board.html');
        return false;
    }
    return true;
}
