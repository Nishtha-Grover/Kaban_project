import { requestJson } from './httpClient.js';
import { loadState } from './state.js';

let dialog, taskId, page = 1, generation = 0, busy = false, returnFocus;
let maxFileBytes = 3 * 1024 * 1024;
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function status(message) { dialog.querySelector('[data-file-status]').textContent = message; }
function setBusy(value) {
    busy = value;
    dialog.querySelectorAll('button, input').forEach(control => control.disabled = value);
}
function base() { return `/api/tasks/${taskId}/attachments`; }
async function list() {
    const version = ++generation, path = base();
    setBusy(true); status('Loading attachments…');
    dialog.querySelector('[data-file-list]').replaceChildren();
    try {
        const result = await requestJson(`${path}?page=${page}`, { label: 'Load attachments' });
        if (version !== generation) return;
        maxFileBytes = result.maxFileBytes || 3 * 1024 * 1024;
        dialog.querySelector('.field-help').textContent = `PDF, PNG, JPEG, TXT, CSV or JSON · up to ${maxFileBytes / 1024 / 1024} MiB each.`;
        if (!result.attachments.length && page > 1) { page--; return await list(); }
        const container = dialog.querySelector('[data-file-list]');
        for (const file of result.attachments) {
            const row = element('li', '', 'attachment-row');
            const copy = element('div');
            copy.append(element('strong', file.originalName), element('small', `${(file.size / 1024).toFixed(1)} KB · ${file.mimeType}`));
            const download = element('a', 'Download', 'secondary');
            download.href = `${path}/${file.id}/download`;
            download.setAttribute('download', file.originalName);
            const remove = element('button', 'Remove', 'text-button');
            remove.type = 'button';
            remove.addEventListener('click', () => removeFile(file));
            row.append(copy, download, remove); container.append(row);
        }
        status(result.total ? `${result.total} file(s) · Page ${page} of ${result.totalPages}` : 'No files yet. Add notes, references or your assignment.');
        setBusy(false);
        dialog.querySelector('[data-file-prev]').disabled = page <= 1;
        dialog.querySelector('[data-file-next]').disabled = page >= result.totalPages;
    } catch (error) {
        if (version === generation) { setBusy(false); status(error.message); }
    }
}
async function refreshBoard() {
    try { await loadState(); }
    catch { status('File change saved. Reload the board to refresh its activity.'); }
}
async function removeFile(file) {
    if (busy || !confirm(`Permanently remove “${file.originalName}”?`)) return;
    setBusy(true); status('Removing file…');
    try {
        await requestJson(`${base()}/${file.id}`, { method: 'DELETE', json: {}, label: 'Remove attachment' });
        await list(); await refreshBoard();
    } catch (error) { setBusy(false); status(`${error.message} Refresh the list before trying again.`); }
}
async function upload(event) {
    event.preventDefault();
    if (busy) return;
    const input = dialog.querySelector('input[type=file]'), file = input.files[0];
    if (!file) { status('Choose a file first.'); return; }
    if (!file.size || file.size > maxFileBytes) { status(`Choose a nonempty file up to ${maxFileBytes / 1024 / 1024} MiB.`); return; }
    const body = new FormData(); body.append('file', file);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    setBusy(true); status('Uploading file…');
    try {
        const response = await fetch(base(), { method: 'POST', body, credentials: 'same-origin', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || 'Upload failed.');
        input.value = '';
        await list(); await refreshBoard();
    } catch (error) {
        setBusy(false);
        status(`${error.name === 'AbortError' ? 'Upload timed out.' : error.message} Refresh the file list before retrying; the server may have saved it.`);
    } finally { clearTimeout(timer); }
}
function createDialog() {
    dialog = element('dialog', '', 'attachment-dialog');
    dialog.setAttribute('aria-labelledby', 'attachment-title');
    const header = element('div', '', 'modal-header'), title = element('h2');
    title.id = 'attachment-title';
    const close = element('button', 'Close', 'secondary'); close.type = 'button';
    close.addEventListener('click', () => { if (!busy) dialog.close(); });
    header.append(title, close);
    const help = element('p', 'Loading file limits…', 'field-help');
    const form = element('form', '', 'attachment-upload');
    const label = element('label', 'Choose a file');
    const input = element('input'); input.type = 'file'; input.id = 'attachment-file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.json'; label.htmlFor = input.id;
    const submit = element('button', 'Upload file', 'primary'); submit.type = 'submit';
    form.append(label, input, submit); form.addEventListener('submit', upload);
    const notice = element('p'); notice.dataset.fileStatus = ''; notice.setAttribute('role', 'status');
    const files = element('ul', '', 'attachment-list'); files.dataset.fileList = '';
    const controls = element('div', '', 'attachment-pagination');
    for (const [name, text, change] of [['prev', 'Previous', -1], ['next', 'Next', 1], ['refresh', 'Refresh files', 0]]) {
        const button = element('button', text, 'secondary'); button.type = 'button';
        button.dataset[`file${name[0].toUpperCase()}${name.slice(1)}`] = '';
        button.addEventListener('click', () => { if (!busy) { page = Math.max(1, page + change); list(); } });
        controls.append(button);
    }
    dialog.append(header, help, form, notice, files, controls);
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { generation++; returnFocus?.focus(); });
    document.body.append(dialog);
}
export function openAttachments(task) {
    if (!dialog) createDialog();
    if (busy) return;
    returnFocus = document.activeElement; taskId = task.id; page = 1;
    dialog.querySelector('h2').textContent = `Files · ${task.title}`;
    dialog.querySelector('input').value = '';
    dialog.showModal(); list();
}
