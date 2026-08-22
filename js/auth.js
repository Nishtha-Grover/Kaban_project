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
        const users = localStorage.getItem(USERS_KEY);
        return users ? JSON.parse(users) : {};
    } catch (e) {
        console.warn("Failed to parse users from localStorage", e);
        return {};
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
    const users = getUsers();

    if (users[trimmedUsername]) {
        return { success: false, error: 'Username already exists. Please choose another.' };
    }

    users[trimmedUsername] = {
        username: trimmedUsername,
        password: password, // Plaintext, Phase 1 only!
        createdAt: new Date().toISOString()
    };

    saveUsers(users);
    
    // Automatically log in after registration
    loginUser(trimmedUsername, password);
    
    return { success: true };
}

/**
 * Attempt to log in a user.
 * @param {string} username 
 * @param {string} password 
 * @returns {Object} { success: boolean, error?: string }
 */
export function loginUser(username, password) {
    const trimmedUsername = (username || '').trim();
    const users = getUsers();
    const user = users[trimmedUsername];

    if (!user) {
        return { success: false, error: 'Invalid username or password.' };
    }
    
    if (user.password !== password) {
        return { success: false, error: 'Invalid username or password.' };
    }

    // Set active session
    localStorage.setItem(SESSION_KEY, trimmedUsername);
    return { success: true };
}

/**
 * Log out the current user.
 */
export function logoutUser() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
}

/**
 * Get the currently logged-in username.
 * @returns {string|null}
 */
export function getSessionUsername() {
    return localStorage.getItem(SESSION_KEY);
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
    return true;
}

/**
 * Call this on public auth pages (index, login, signup)
 * Redirects to board.html if a session ALREADY exists.
 */
export function requireNoAuth() {
    return true;
}
