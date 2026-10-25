import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { startApiFixture } from './helpers/apiFixture.js';
import { Attachment } from '../server/models/Attachment.js';
import { AttachmentBlob } from '../server/models/AttachmentBlob.js';

async function until(predicate) {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Timed out waiting for board UI');
}
test('board forms and controls save to the real database', { timeout: 90000 }, async t => {
    const fixture = await startApiFixture();
    const dom = new JSDOM(await readFile(new URL('../board.html', import.meta.url), 'utf8'), {
        url: fixture.baseUrl + '/board.html', runScripts: 'outside-only', pretendToBeVisual: true
    });
    t.after(async () => { dom.window.close(); await fixture.close(); });
    const { window } = dom, document = window.document;
    const $ = id => document.getElementById(id);
    window.AbortController = AbortController; window.Headers = Headers;
    window.TextEncoder = TextEncoder;
    window.FormData = FormData;
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
    window.confirm = () => true;
    let offline = false, loseWriteResponse = false;
    window.fetch = async (path, options = {}) => {
        if (offline) throw new window.TypeError('Offline');
        const url = new URL(path, fixture.baseUrl).href;
        const headers = new Headers(options.headers), cookie = dom.cookieJar.getCookieStringSync(url);
        if (cookie) headers.set('Cookie', cookie);
        const response = await fetch(url, { ...options, headers });
        if (loseWriteResponse && options.method === 'POST' && path === '/api/tasks') {
            loseWriteResponse = false;
            throw new window.TypeError('Response lost after commit');
        }
        for (const value of response.headers.getSetCookie()) dom.cookieJar.setCookieSync(value, url);
        return response;
    };
    const context = dom.getInternalVMContext(), cache = new Map(), root = new URL('../js/', import.meta.url);
    async function moduleAt(url) {
        if (!cache.has(url.href)) cache.set(url.href, new SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href }));
        return cache.get(url.href);
    }
    async function use(name) {
        const module = await moduleAt(new URL(name, root));
        if (module.status === 'unlinked') await module.link((specifier, parent) => moduleAt(new URL(specifier, parent.identifier)));
        if (module.status !== 'evaluated') await module.evaluate();
        return module.namespace;
    }
    const auth = await use('auth.js');
    assert.equal((await auth.registerUser('board_user', 'Board-Password-123!')).success, true);
    window.localStorage.setItem('flowforge-board-board_user', 'preserve legacy');
    const state = await use('state.js'), render = await use('render.js'), form = await use('taskForm.js');
    await state.loadState();
    state.subscribe(render.renderBoard); form.initTaskForm(); render.renderBoard();
    await t.test('create form saves database ID and survives reload', async () => {
        window.openTaskModal(); $('task-title').value = 'Database assignment';
        $('task-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await until(() => $('task-modal').classList.contains('hidden'));
        const task = Object.values(state.getTasks())[0];
        assert.match(task.id, /^[a-f0-9]{24}$/); assert.equal(task.version, 0);
        await state.loadState(); assert.equal(state.getTask(task.id).title, 'Database assignment');
        assert.equal(state.getActivities()[0].type, 'create');
        assert.equal(window.localStorage.getItem('flowforge-board-board_user'), 'preserve legacy');
    });
    await t.test('edit form and status dropdown persist', async () => {
        const task = Object.values(state.getTasks())[0];
        window.openTaskModal(task.id); $('task-title').value = 'Edited assignment';
        $('task-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await until(() => $('task-modal').classList.contains('hidden'));
        assert.equal(state.getTask(task.id).title, 'Edited assignment');
        const move = document.querySelector('.task-move'); move.value = 'done';
        move.dispatchEvent(new window.Event('change'));
        await until(() => state.getTask(task.id).status === 'done');
        await state.loadState(); assert.equal(state.getTask(task.id).status, 'done');
    });
    await t.test('dependency errors preserve state and require reload', async () => {
        const prerequisite = await state.addTask({ title: 'Prerequisite' });
        const dependent = await state.addTask({ title: 'Dependent', dependsOn: [prerequisite] });
        await assert.rejects(state.updateTaskStatus(dependent, 'done'));
        assert.equal(state.getTask(dependent).status, 'todo');
        await state.loadState();
        await assert.rejects(state.deleteTask(prerequisite));
        await state.loadState(); assert.ok(state.getTask(prerequisite));
    });
    await t.test('delete button removes saved task and persists audit record', async () => {
        const card = [...document.querySelectorAll('.task-card')].find(item => item.textContent.includes('Edited assignment'));
        [...card.querySelectorAll('button')].find(button => button.textContent === 'Delete').click();
        await until(() => !Object.values(state.getTasks()).some(task => task.title === 'Edited assignment'));
        await state.loadState(); assert.equal(state.getActivities()[0].type, 'delete');
    });
    await t.test('library writes persist; offline saves do not add phantom tasks', async () => {
        assert.equal(await state.importTasks([{ title: 'Library task', externalId: 'template-1' }]), 1);
        await state.loadState(); const count = Object.keys(state.getTasks()).length;
        offline = true;
        await assert.rejects(state.addTask({ title: 'Unsaved task' }));
        assert.equal(Object.keys(state.getTasks()).length, count);
        offline = false; await state.loadState();
        assert.equal(Object.keys(state.getTasks()).length, count);
        assert.equal(state.canUndo(), true);
    });
    await t.test('lost write response requires reconciliation without duplicate retry', async () => {
        loseWriteResponse = true;
        await assert.rejects(state.addTask({ title: 'Saved despite lost response' }));
        await assert.rejects(state.addTask({ title: 'Saved despite lost response' }), /Reload/);
        await state.loadState();
        assert.equal(Object.values(state.getTasks()).filter(task => task.title === 'Saved despite lost response').length, 1);
    });
    await t.test('database undo survives reload and reset can restore task links', async () => {
        const id = await state.addTask({ title: 'Undo example' });
        const originalVersion = state.getTask(id).version;
        await state.updateTask(id, { title: 'Changed title' });
        await state.loadState();
        assert.equal(await state.undoLastAction(), true);
        assert.equal(state.getTask(id).title, 'Undo example');
        assert.ok(state.getTask(id).version > originalVersion + 1);
        assert.equal(state.canUndo(), false);
        const before = Object.values(state.getTasks()).map(task => ({ id: task.id, dependsOn: [...task.dependsOn] }));
        await state.resetBoard(); assert.equal(Object.keys(state.getTasks()).length, 0);
        await state.loadState(); assert.equal(await state.undoLastAction(), true);
        for (const task of before) assert.equal(JSON.stringify(state.getTask(task.id).dependsOn), JSON.stringify(task.dependsOn));
    });
    await t.test('library batch rolls back invalid records and undo removes the entire batch', async () => {
        const count = Object.keys(state.getTasks()).length;
        await assert.rejects(state.importTasks([{ title: 'Should roll back' }, { title: '' }]));
        await state.loadState(); assert.equal(Object.keys(state.getTasks()).length, count);
        assert.equal(await state.importTasks([{ title: 'Batch one' }, { title: 'Batch two' }]), 2);
        assert.equal(Object.keys(state.getTasks()).length, count + 2);
        assert.equal(await state.undoLastAction(), true);
        assert.equal(Object.keys(state.getTasks()).length, count);
    });
    await t.test('stale reset and undo cannot overwrite a newer task change', async () => {
        const history = await (await window.fetch('/api/tasks/history')).json();
        const id = await state.addTask({ title: 'Newer work' });
        for (const operation of ['reset', 'undo']) {
            const result = await window.fetch(`/api/tasks/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: history.revision }) });
            assert.equal(result.status, 409);
        }
        await state.loadState(); assert.equal(state.getTask(id).title, 'Newer work');
    });
    await t.test('browser import previews linked tasks, preserves old data and deduplicates retries', async () => {
        const migration = await use('browserMigration.js'); migration.initBrowserMigration();
        const old = JSON.stringify({ tasks: {
            oldA: { title: 'Old prerequisite', status: 'done', dependsOn: [], dueDate: '2026-11-01' },
            oldB: { title: 'Old dependent', status: 'inprogress', dependsOn: ['oldA'] }
        } });
        window.localStorage.setItem('kanban-board-board_user', old);
        const before = Object.keys(state.getTasks()).length;
        $('migrate-browser-btn').click();
        $('migration-source').value = 'kanban-board-board_user';
        $('migration-source').dispatchEvent(new window.Event('change'));
        assert.equal($('migration-preview').children.length, 2);
        $('migration-save').click();
        await until(() => !$('migration-source').disabled);
        assert.match($('migration-status').textContent, /2 tasks imported/);
        assert.equal(Object.keys(state.getTasks()).length, before + 2);
        const a = Object.values(state.getTasks()).find(task => task.title === 'Old prerequisite');
        const b = Object.values(state.getTasks()).find(task => task.title === 'Old dependent');
        assert.equal(b.dependsOn[0], a.id); assert.equal(b.status, 'inprogress');
        assert.equal(a.dueDate, '2026-11-01');
        assert.equal(window.localStorage.getItem('kanban-board-board_user'), old);
        const body = { tasks: migration.parseBrowserBackup(old) };
        const response = await window.fetch('/api/tasks/import-browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        assert.equal(response.status, 200); assert.equal((await response.json()).alreadyImported, true);
        await state.loadState(); assert.equal(Object.keys(state.getTasks()).length, before + 2);
        for (const broken of [
            [{ legacyId: 'x', title: 'Missing edge', status: 'todo', dependsOn: ['missing'] }],
            [{ legacyId: 'x', title: 'Cycle A', status: 'todo', dependsOn: ['y'] }, { legacyId: 'y', title: 'Cycle B', status: 'todo', dependsOn: ['x'] }],
            [{ legacyId: 'x', title: 'Valid task', status: 'todo', dependsOn: [] }, { legacyId: 'y', title: '', status: 'todo', dependsOn: [] }]
        ]) {
            const rejected = await window.fetch('/api/tasks/import-browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: broken }) });
            assert.equal(rejected.status, 400);
        }
        await state.loadState(); assert.equal(Object.keys(state.getTasks()).length, before + 2);
        $('migration-close').click();
    });
    let filePath;
    await t.test('Files dialog uploads, lists, downloads and removes bytes', async () => {
        const task = Object.values(state.getTasks())[0];
        const card = document.querySelector(`[data-id="${task.id}"]`);
        [...card.querySelectorAll('button')].find(button => button.textContent === 'Files').click();
        const dialog = document.querySelector('dialog[aria-labelledby="attachment-title"]');
        await until(() => dialog.querySelector('[data-file-status]').textContent.includes('No files'));
        const input = dialog.querySelector('input[type=file]');
        Object.defineProperty(input, 'files', { configurable: true, value: [new File(['Attachment contents'], 'notes.txt', { type: 'text/plain' })] });
        dialog.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await until(() => dialog.querySelectorAll('.attachment-row').length === 1 && !dialog.querySelector('input').disabled);
        const link = dialog.querySelector('.attachment-row a');
        assert.equal(await (await window.fetch(link.getAttribute('href'))).text(), 'Attachment contents');
        const listing = await (await window.fetch(`/api/tasks/${task.id}/attachments`)).json();
        assert.equal(listing.attachments[0].storageKey, undefined);
        assert.equal(listing.attachments[0].owner, undefined);
        filePath = `/api/tasks/${task.id}/attachments`;
        // Wait for the audit refresh after the upload, then remove through the UI.
        await until(() => state.getActivities()[0]?.type === 'upload');
        assert.equal(state.canUndo(), false); // Upload invalidates older task undo snapshots.
        await assert.rejects(state.resetBoard()); // Never orphan attached file records.
        await state.loadState();
        dialog.querySelector('.attachment-row button').click();
        await until(() => dialog.querySelector('[data-file-status]').textContent.includes('No files'));
        await until(() => state.getActivities()[0]?.type === 'delete-attachment');
        assert.equal(await Attachment.countDocuments({ task: task.id }), 0);
        assert.equal(await AttachmentBlob.countDocuments(), 0);
        assert.equal((await window.fetch(link.getAttribute('href'))).status, 404);
        dialog.querySelector('.modal-header button').click();
        assert.equal(dialog.open, false);
    });
    await t.test('account change blocks old workspace edits and attachment access', async () => {
        assert.equal((await auth.registerUser('second_board_user', 'Board-Password-123!')).success, true);
        await assert.rejects(state.addTask({ title: 'Wrong workspace' }), /session changed/);
        await state.loadState();
        assert.equal(Object.keys(state.getTasks()).length, 0);
        assert.equal((await window.fetch(filePath)).status, 404);
        assert.equal((await window.fetch(`${filePath}/${'a'.repeat(24)}`, { method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
    });
});
