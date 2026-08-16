const THEME_KEY = 'flowforge-theme';

export function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(saved || preferred);
}

export function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
}

export function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const label = document.getElementById('theme-label');
    if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
}
