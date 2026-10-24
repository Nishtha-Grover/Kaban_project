// Server session only. Credentials and JWTs are never stored in browser storage.
let currentUser = null;
let watching = false;

async function authRequest(path, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`/api/auth/${path}`, {
            method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
            signal: controller.signal,
            ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        });
        const result = response.status === 204 ? null : await response.json();
        if (!response.ok) throw Object.assign(new Error(response.status === 503
            ? 'Database sign-in is unavailable. Check the server’s MongoDB and JWT configuration.'
            : result?.error?.message || 'Authentication failed. Please try again.'), { status: response.status });
        return result;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Sign-in request timed out. Please try again.');
        if (error instanceof TypeError) throw new Error('Cannot reach the server. Start npm run dev and try again.');
        throw error;
    } finally { clearTimeout(timer); }
}

export async function registerUser(username, password) {
    try {
        await authRequest('register', { username: username.trim(), password });
        const login = await loginUser(username, password);
        return login.success ? login : { success: false, error: `Account created. Please sign in: ${login.error}` };
    } catch (error) { return { success: false, error: error.message }; }
}
export async function loginUser(username, password) {
    currentUser = null;
    try {
        const result = await authRequest('login', { username: username.trim(), password });
        currentUser = result.user;
        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
}
export async function refreshSession() {
    currentUser = null;
    try { currentUser = (await authRequest('me')).user; return currentUser; }
    catch (error) { if (error.status === 401) return null; throw error; }
}
export function getSessionUsername() { return currentUser?.username ?? null; }
// Transitional local-board namespace prevents claiming legacy username-based data.
export function getWorkspaceIdentity() { return currentUser ? `database-${currentUser.id}` : null; }
export async function logoutUser() {
    await authRequest('logout', {});
    currentUser = null;
    window.location.replace('index.html');
}
function watchSession(expectedId) {
    if (watching) return;
    watching = true;
    let checking = false;
    const check = async () => {
        if (checking || document.visibilityState === 'hidden') return;
        checking = true;
        const main = document.getElementById('workspace-main');
        if (main) main.inert = true;
        try {
            const user = await refreshSession();
            if (!user || user.id !== expectedId) { window.location.replace(user ? 'board.html' : 'login.html'); return; }
            if (main) main.inert = false;
        } catch (error) {
            const notice = document.getElementById('storage-notice');
            if (notice) { notice.textContent = `${error.message} Reload this page before editing.`; notice.hidden = false; }
        } finally { checking = false; }
    };
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
}
export async function requireAuth() {
    const user = await refreshSession();
    if (!user) { window.location.replace('login.html'); return false; }
    watchSession(user.id); return true;
}
export async function requireNoAuth() {
    try {
        if (await refreshSession()) { window.location.replace('board.html'); return false; }
    } catch { /* Leave the form available; submission displays connection errors. */ }
    return true;
}
