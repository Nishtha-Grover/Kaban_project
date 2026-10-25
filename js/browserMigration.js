import { getSessionUsername, getWorkspaceIdentity } from './auth.js';
import { requestJson } from './httpClient.js';
import { loadState } from './state.js';

export function parseBrowserBackup(text) {
    const raw = JSON.parse(text);
    if (!raw?.tasks || typeof raw.tasks !== 'object' || Array.isArray(raw.tasks)) throw new Error('Choose a FlowForge browser backup with a tasks object.');
    const entries = Object.entries(raw.tasks);
    if (!entries.length || entries.length > 100) throw new Error('The backup must contain 1–100 tasks.');
    return entries.map(([legacyId, task]) => {
        if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Invalid task in backup.');
        return { legacyId, title: task.title, description: task.description ?? '', status: task.status ?? 'todo',
            priority: task.priority ?? 'medium', category: task.category ?? 'General', dueDate: task.dueDate ?? '',
            tags: task.tags ?? [], dependsOn: task.dependsOn ?? [] };
    });
}

export function initBrowserMigration() {
    const dialog = document.getElementById('migration-dialog');
    const source = document.getElementById('migration-source'), file = document.getElementById('migration-file');
    const preview = document.getElementById('migration-preview'), status = document.getElementById('migration-status');
    const save = document.getElementById('migration-save'), backup = document.getElementById('migration-backup');
    let selected = null, busy = false, owner, readVersion = 0;
    const show = text => {
        selected = null; save.disabled = backup.disabled = true; preview.replaceChildren();
        try {
            const tasks = parseBrowserBackup(text);
            if (new TextEncoder().encode(JSON.stringify({ tasks })).length > 95000) throw new Error('Backup is too large for the 100 KB import limit.');
            for (const task of tasks) {
                const row = document.createElement('li');
                row.textContent = `${task.title} · ${task.status} · ${(task.dependsOn || []).length} prerequisite(s)`;
                preview.append(row);
            }
            selected = tasks; save.disabled = backup.disabled = false;
            status.textContent = `${tasks.length} tasks ready for review. Existing database tasks will stay unchanged.`;
        } catch (error) { status.textContent = error.message; }
    };
    document.getElementById('migrate-browser-btn').addEventListener('click', () => {
        owner = getWorkspaceIdentity(); selected = null; readVersion++;
        save.disabled = backup.disabled = true; file.value = ''; preview.replaceChildren(); source.replaceChildren();
        const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose saved browser data'; source.append(placeholder);
        try {
            for (const key of [`flowforge-board-${getSessionUsername()}`, `kanban-board-${getSessionUsername()}`, `flowforge-board-${owner}`]) {
                if (localStorage.getItem(key)) {
                    const option = document.createElement('option'); option.value = key; option.textContent = key; source.append(option);
                }
            }
            status.textContent = source.options.length > 1 ? 'Choose a source to preview.' : 'No old data found at this address. You can select an exported browser-backup JSON file.';
        } catch { status.textContent = 'Browser storage is unavailable. Choose an exported backup file instead.'; }
        dialog.showModal();
    });
    source.addEventListener('change', () => {
        readVersion++; file.value = '';
        selected = null; save.disabled = backup.disabled = true; preview.replaceChildren();
        try { show(localStorage.getItem(source.value) || '{}'); } catch (error) { status.textContent = error.message; }
    });
    file.addEventListener('change', async () => {
        const version = ++readVersion; selected = null; save.disabled = backup.disabled = true; source.value = '';
        const chosen = file.files[0];
        if (!chosen) return;
        if (chosen.size > 1024 * 1024) { status.textContent = 'Choose a backup smaller than 1 MiB.'; return; }
        try { const text = await chosen.text(); if (version === readVersion) show(text); }
        catch { if (version === readVersion) status.textContent = 'Could not read this file.'; }
    });
    backup.addEventListener('click', () => {
        if (!selected) return;
        const tasks = Object.fromEntries(selected.map(({ legacyId, ...task }) => [legacyId, task]));
        const url = URL.createObjectURL(new Blob([JSON.stringify({ tasks }, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'flowforge-browser-backup.json'; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    save.addEventListener('click', async () => {
        if (busy || !selected) return;
        if (owner !== getWorkspaceIdentity()) { status.textContent = 'Your account changed. Reload before importing.'; return; }
        busy = true; save.disabled = true; source.disabled = file.disabled = true;
        status.textContent = 'Importing your reviewed tasks…';
        try {
            const result = await requestJson('/api/tasks/import-browser', { method: 'POST', json: { tasks: selected }, label: 'Import browser tasks', timeoutMs: 30000 });
            status.textContent = result.alreadyImported ? 'This exact backup was already imported. No duplicate tasks were added.' : `${result.imported} tasks imported. Your original browser data is still preserved.`;
            try { await loadState(); } catch { status.textContent += ' Reload the board to refresh its view.'; }
        } catch (error) { status.textContent = `${error.message} Retrying this same backup is safe: duplicate imports are prevented.`; save.disabled = false; }
        finally { busy = false; source.disabled = file.disabled = false; }
    });
    document.getElementById('migration-close').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { readVersion++; document.getElementById('migrate-browser-btn').focus(); });
}
