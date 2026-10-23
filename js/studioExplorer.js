let collection = 'users', page = 1, sequence = 0, pending;
const byId = id => document.getElementById(id);

export async function loadDocuments(key = collection, requestedPage = 1) {
    collection = key; page = requestedPage;
    const request = ++sequence;
    pending?.abort(); const controller = new AbortController(); pending = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    byId('explorer-collection').textContent = key === 'blobs' ? 'File storage (metadata only)' : key;
    byId('explorer-status').textContent = 'Loading your documents…';
    byId('explorer-documents').replaceChildren();
    byId('documents-page').textContent = 'Loading…';
    byId('documents-previous').disabled = true; byId('documents-next').disabled = true;
    try {
        const expand = byId('expand-relationships').checked ? '&expand=relationships' : '';
        const response = await fetch(`/api/studio/collections/${encodeURIComponent(key)}?page=${page}&limit=10${expand}`,
            { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (request !== sequence) return;
        if (response.status === 401) {
            byId('studio-signin').hidden = false;
            throw new Error('Sign in to view your database documents.');
        }
        if (response.status === 503) throw new Error('Database access is unavailable. Configure MongoDB and server authentication, then refresh.');
        if (!response.ok) throw new Error('Documents could not be loaded. Please try again.');
        const result = await response.json();
        if (request !== sequence) return;
        byId('studio-signin').hidden = true;
        byId('explorer-status').textContent = result.documents.length
            ? `${result.total} document${result.total === 1 ? '' : 's'} in your ${key === 'users' ? 'account' : 'workspace'}. Select a document to inspect it.`
            : 'No documents on this page. Data created through the database APIs will appear here; browser-only tasks are separate.';
        for (const document of result.documents) {
            const details = window.document.createElement('details');
            const summary = window.document.createElement('summary');
            summary.textContent = document.title || document.originalName || document.username || document.action || String(document._id);
            const pre = window.document.createElement('pre');
            pre.textContent = JSON.stringify(document, null, 2); pre.tabIndex = 0;
            details.append(summary);
            if (result.expanded) details.append(renderRelationships(document, key));
            details.append(pre); byId('explorer-documents').append(details);
        }
        byId('documents-page').textContent = `Page ${result.page} · ${result.totalPages} total pages`;
        byId('documents-previous').disabled = page <= 1;
        byId('documents-next').disabled = page >= result.totalPages;
    } catch (error) {
        if (request !== sequence) return;
        byId('explorer-status').textContent = error.name === 'AbortError' ? 'Request timed out. Check the server and refresh.'
            : error instanceof TypeError ? 'Cannot reach the server. Start npm run dev, then refresh.' : error.message;
        byId('documents-page').textContent = 'No documents loaded';
    } finally { clearTimeout(timer); }
}

function renderRelationships(record, key) {
    const section = document.createElement('div'); section.className = 'explorer-links';
    const add = (label, value) => {
        const line = document.createElement('p'), name = document.createElement('strong'), text = document.createElement('span');
        name.textContent = label;
        text.textContent = value ? `${value.title || value.displayName || value.username || value._id}${value.status ? ` · ${value.status}` : ''}` : 'Not available in this workspace';
        line.append(name, text); section.append(line);
    };
    if (key === 'users') {
        const text = document.createElement('p'); text.textContent = 'Your account has no outgoing references to populate.'; section.append(text);
    } else add('Owner →', record.owner);
    if (Object.hasOwn(record, 'task')) add('Task →', record.task);
    if (record.dependsOn) {
        if (record.dependsOn.length) record.dependsOn.forEach(task => add('Prerequisite →', task));
        else { const text = document.createElement('p'); text.textContent = 'No available prerequisite references.'; section.append(text); }
    }
    return section;
}
byId('expand-relationships').addEventListener('change', () => {
    byId('relationship-mode').textContent = byId('expand-relationships').checked
        ? 'Populate replaces reference IDs with owner and task summaries. Unavailable references appear as null or are omitted from arrays.'
        : 'Reference IDs are shown as stored. Enable populate to see the linked owner and task summaries.';
    loadDocuments(collection, page);
});
byId('documents-refresh').addEventListener('click', () => loadDocuments(collection, page));
byId('documents-previous').addEventListener('click', () => loadDocuments(collection, page - 1));
byId('documents-next').addEventListener('click', () => loadDocuments(collection, page + 1));
byId('studio-signin').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ username: byId('studio-username').value, password: byId('studio-password').value }) });
        if (!response.ok) {
            throw new Error(response.status === 401 ? 'Username or password is incorrect.'
                : response.status === 503 ? 'Database sign-in is not configured yet. MongoDB and JWT configuration are required.' : 'Sign-in failed. Try again.');
        }
        await loadDocuments(collection);
    } catch (error) { byId('explorer-status').textContent = error.name === 'AbortError' ? 'Sign-in timed out. Try again.' : error.message; }
    finally { clearTimeout(timer); byId('studio-password').value = ''; button.disabled = false; }
});
