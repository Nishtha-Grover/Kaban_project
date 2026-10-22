const button = document.getElementById('demo-complete');
button.addEventListener('click', () => {
    const done = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(done));
    button.textContent = done ? 'Reset ↺' : 'Complete ✓';
    document.getElementById('first-status').textContent = done ? 'Completed. Nice work!' : 'Ready to work on';
    document.getElementById('next-status').textContent = done ? 'Unlocked — ready to start!' : 'Waiting on the design';
    document.getElementById('next-task').classList.toggle('locked', !done);
});
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.landing-feature, .connect-section, .closing').forEach(element => {
        element.classList.add('reveal');
        observer.observe(element);
    });
}
