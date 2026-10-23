const THEME_KEY = 'flowforge-theme';
let preference = null;
let deviceTheme;
let initialized = false;

function validTheme(value) {
    return value === 'dark' || value === 'light';
}

function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const label = document.getElementById('theme-label');
    if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.textContent = dark ? '☀' : '☾';
        icon.setAttribute('aria-hidden', 'true');
    }
    const button = document.getElementById('theme-toggle');
    if (button) button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
}

function applyPreference() {
    applyTheme(preference || (deviceTheme?.matches ? 'dark' : 'light'));
}

export function initTheme() {
    if (initialized) return;
    initialized = true;
    deviceTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    try {
        const saved = localStorage.getItem(THEME_KEY);
        preference = validTheme(saved) ? saved : null;
    } catch {
        // The theme still works when browser storage is disabled.
        preference = null;
    }
    applyPreference();
    deviceTheme?.addEventListener('change', () => {
        if (!preference) applyPreference();
    });
    window.addEventListener('storage', (event) => {
        if (event.storageArea !== localStorage) return;
        if (event.key !== THEME_KEY && event.key !== null) return;
        preference = validTheme(event.newValue) ? event.newValue : null;
        applyPreference();
    });
}

export function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
}

export function setTheme(theme) {
    if (!validTheme(theme)) return;
    preference = theme;
    applyTheme(theme);
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // Keep the chosen theme for this page even if it cannot be saved.
    }
}
