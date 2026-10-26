// Apply the saved theme before stylesheets and page content are painted.
(() => {
    let saved;
    try { saved = localStorage.getItem('flowforge-theme'); }
    catch { /* Browser storage may be unavailable. */ }
    const theme = saved === 'dark' || saved === 'light' ? saved
        : window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
})();
