import { loadDocuments } from './studioExplorer.js';
const seed = document.getElementById('seed-demo'), exportButton = document.getElementById('export-workspace');
const status = document.getElementById('studio-data-status');
async function perform(action) {
    seed.disabled = true; exportButton.disabled = true;
    status.textContent = action === 'seed' ? 'Adding the demo project…' : 'Preparing your JSON export…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(`/api/studio/${action}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            ...(action === 'seed' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}) });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(response.status === 401 ? 'Sign in to your database account first.' : body.error?.message || 'The operation failed. Try again.');
        }
        if (action === 'seed') {
            const result = await response.json();
            status.textContent = result.alreadySeeded ? 'This account already received the demo project. No duplicate tasks were added.' : 'Four linked demo tasks added. Select Tasks to inspect their dependencies.';
            // Preserve the collection selected in the schema guide.
            const selected = document.querySelector('[data-collection][aria-pressed="true"]');
            loadDocuments(selected?.dataset.collection || 'tasks');
        } else {
            const blob = await response.blob(), url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = 'flowforge-workspace.json';
            document.body.append(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            status.textContent = 'JSON export prepared. Check your browser downloads. Uploaded file bytes are excluded.';
        }
    } catch (error) {
        status.textContent = error.name === 'AbortError'
            ? 'The request timed out. Refresh to check the result; retrying demo seeding will not duplicate tasks.' : error.message;
    } finally { clearTimeout(timer); seed.disabled = false; exportButton.disabled = false; }
}
seed.addEventListener('click', () => perform('seed'));
exportButton.addEventListener('click', () => perform('export'));
