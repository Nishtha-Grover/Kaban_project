import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { startApiFixture } from './helpers/apiFixture.js';

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
        assert.equal(state.canUndo(), false);
    });
    await t.test('lost write response requires reconciliation without duplicate retry', async () => {
        loseWriteResponse = true;
        await assert.rejects(state.addTask({ title: 'Saved despite lost response' }));
        await assert.rejects(state.addTask({ title: 'Saved despite lost response' }), /Reload/);
        await state.loadState();
        assert.equal(Object.values(state.getTasks()).filter(task => task.title === 'Saved despite lost response').length, 1);
    });
    await t.test('account change blocks old workspace edits', async () => {
        assert.equal((await auth.registerUser('second_board_user', 'Board-Password-123!')).success, true);
        await assert.rejects(state.addTask({ title: 'Wrong workspace' }), /session changed/);
        await state.loadState();
        assert.equal(Object.keys(state.getTasks()).length, 0);
    });
});
