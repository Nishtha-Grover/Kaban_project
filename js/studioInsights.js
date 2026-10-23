const el = id => document.getElementById(id);
function chart(id, rows, total) {
    const container = el(id); container.replaceChildren();
    if (!rows.length) { const p = document.createElement('p'); p.textContent = 'No task data yet.'; container.append(p); }
    for (const row of rows) {
        const label = document.createElement('div'); label.className = 'insight-bar-label';
        const name = document.createElement('span'), count = document.createElement('strong');
        name.textContent = row._id; count.textContent = row.count; label.append(name, count);
        const bar = document.createElement('div'), fill = document.createElement('span'); bar.className = 'insight-bar';
        bar.setAttribute('aria-hidden', 'true'); fill.style.width = `${total ? Math.min(100, row.count / total * 100) : 0}%`;
        bar.append(fill); container.append(label, bar);
    }
}
async function loadInsights() {
    const button = el('insights-refresh');
    if (button.disabled) return;
    button.disabled = true; el('insights-content').hidden = true;
    el('insights-status').textContent = 'Running your workspace aggregation…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch('/api/studio/insights', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in above, then refresh insights.'
            : response.status === 503 ? 'Database access is unavailable. Check MongoDB and authentication setup.' : 'Insights could not be loaded. Try again.');
        const data = await response.json();
        el('insight-total').textContent = data.total;
        el('insight-completed').textContent = data.completed;
        el('insight-percent').textContent = `${data.completionPercent}%`;
        el('insight-links').textContent = data.dependencyLinks;
        for (const key of ['statuses', 'priorities', 'categories']) chart(`insight-${key}`, data[key], data.total);
        el('insight-stages').replaceChildren(...data.stages.map(stage => { const li = document.createElement('li'); li.textContent = stage; return li; }));
        el('insight-index-list').replaceChildren(...data.indexes.map(index => {
            const card = document.createElement('article'), key = document.createElement('code'), status = document.createElement('strong'), purpose = document.createElement('p');
            key.textContent = JSON.stringify(index.key); status.textContent = index.installed ? '✓ Installed in MongoDB' : 'Not installed — check database setup';
            purpose.textContent = index.purpose; card.append(key, status, purpose); return card;
        }));
        el('insights-content').hidden = false;
        el('insights-status').textContent = 'Live aggregation for your workspace. Refresh to include subsequent changes.';
    } catch (error) {
        el('insights-status').textContent = error.name === 'AbortError' ? 'The request timed out. Try refreshing.'
            : error instanceof TypeError ? 'Cannot reach the API. Check the server and refresh.' : error.message;
    } finally { clearTimeout(timer); button.disabled = false; }
}
el('insights-refresh').addEventListener('click', loadInsights);
loadInsights();
