import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { startApiFixture } from './helpers/apiFixture.js';

async function until(predicate, description) {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${description}`);
}

test('Studio DOM interacts with the real isolated API', { timeout: 90000 }, async t => {
    const fixture = await startApiFixture();
    let dom;
    t.after(async () => { dom?.window.close(); await fixture.close(); });
    const { baseUrl, request } = fixture;
    const password = 'Frontend-Integration-Password-123!';
    assert.equal((await request('/api/auth/register', { method: 'POST', body: { username: 'ui_student', password } })).status, 201);
    const html = await (await fetch(baseUrl + '/studio.html')).text();
    dom = new JSDOM(html, { url: baseUrl + '/studio.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom, document = window.document;
    const $ = id => document.getElementById(id);
    let offline = false, exportedBlob, downloadedName;
    window.AbortController = AbortController;
    window.fetch = async (path, options = {}) => {
        if (offline) throw new TypeError('Network unavailable');
        const url = new URL(path, window.location.href).href;
        assert.equal(new URL(url).origin, baseUrl); // Never send test credentials elsewhere.
        const headers = new Headers(options.headers);
        const cookie = dom.cookieJar.getCookieStringSync(url);
        if (cookie) headers.set('Cookie', cookie);
        const response = await fetch(url, { ...options, headers });
        for (const cookieValue of response.headers.getSetCookie()) dom.cookieJar.setCookieSync(cookieValue, url);
        return response;
    };
    // jsdom has no browser download manager; capture the generated export artifact.
    window.URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:test-export'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { downloadedName = this.download; };
    const context = dom.getInternalVMContext(), modules = new Map();
    const root = new URL('../js/', import.meta.url);
    async function moduleAt(url) {
        if (!url.href.startsWith(root.href)) throw new Error('Unexpected frontend import');
        if (!modules.has(url.href)) modules.set(url.href, new SourceTextModule(await readFile(fileURLToPath(url), 'utf8'), { context, identifier: url.href }));
        return modules.get(url.href);
    }
    for (const name of ['studio.js', 'studioInsights.js', 'studioData.js']) {
        const module = await moduleAt(new URL(name, root));
        if (module.status === 'unlinked') await module.link((specifier, parent) => moduleAt(new URL(specifier, parent.identifier)));
        await module.evaluate();
    }

    await t.test('unauthenticated view shows sign-in while public schema remains interactive', async () => {
        await until(() => !$('studio-signin').hidden, 'sign-in form');
        document.querySelector('[data-collection="tasks"]').click();
        assert.equal($('collection-title').textContent, 'Tasks');
        $('json-view').click(); assert.equal($('json-panel').hidden, false);
        assert.match($('json-panel').textContent, /dependsOn/);
        $('fields-view').click(); assert.equal($('fields-panel').hidden, false);
        await until(() => !$('insights-refresh').disabled, 'initial insights request');
    });
    await t.test('database login hides form, clears password and loads empty workspace', async () => {
        $('studio-username').value = 'ui_student'; $('studio-password').value = password;
        $('studio-signin').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        await until(() => $('studio-signin').hidden && !$('studio-signin').querySelector('button').disabled, 'login completion');
        assert.equal($('studio-password').value, '');
        assert.match($('explorer-status').textContent, /No documents/);
        assert.equal(document.cookie.includes('flowforge_session'), false); // HttpOnly in cookie jar.
    });
    await t.test('demo button adds four tasks once and populate renders relationship summaries', async () => {
        $('seed-demo').click();
        await until(() => $('explorer-documents').children.length === 4 && !$('seed-demo').disabled, 'demo documents');
        $('seed-demo').click();
        await until(() => $('studio-data-status').textContent.includes('already received'), 'idempotent seed');
        const checkbox = $('expand-relationships'); checkbox.checked = true;
        checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
        await until(() => document.querySelectorAll('.explorer-links').length === 4, 'populated relationships');
        assert.match($('explorer-documents').textContent, /Prerequisite →/);
        assert.match($('explorer-documents').textContent, /ui_student/);
    });
    await t.test('pagination works and document titles render as text, not markup', async () => {
        const cookie = dom.cookieJar.getCookieStringSync(baseUrl);
        for (let index = 0; index < 8; index++) {
            assert.equal((await request('/api/tasks', { method: 'POST', cookie,
                body: { title: index === 7 ? '<img src=x onerror=alert(1)>' : `Extra ${index}` } })).status, 201);
        }
        $('documents-refresh').click();
        await until(() => !$('documents-next').disabled && $('explorer-documents').children.length === 10, 'first page');
        assert.match($('explorer-documents').textContent, /<img src=x/);
        assert.equal($('explorer-documents').querySelector('img'), null);
        $('documents-next').click();
        await until(() => $('documents-page').textContent.includes('Page 2'), 'second page');
        assert.equal($('explorer-documents').children.length, 2);
        $('documents-previous').click();
        await until(() => $('documents-page').textContent.includes('Page 1'), 'previous page');
    });
    await t.test('insight cards display actual aggregation and installed indexes', async () => {
        $('insights-refresh').click();
        await until(() => !$('insights-content').hidden, 'insights');
        assert.equal($('insight-total').textContent, '12');
        assert.equal($('insight-percent').textContent, '0%');
        assert.match($('insight-index-list').textContent, /Installed in MongoDB/);
    });
    await t.test('export button prepares valid owner-scoped JSON without private data', async () => {
        $('export-workspace').click();
        await until(() => downloadedName, 'export artifact');
        assert.equal(downloadedName, 'flowforge-workspace.json');
        const exported = JSON.parse(await exportedBlob.text());
        assert.equal(exported.collections.tasks.length, 12);
        assert.equal(exported.collections.users.length, 1);
        assert.equal(exported.collections.users[0].passwordHash, undefined);
        assert.equal(exported.includesFileBytes, false);
    });
    await t.test('network errors clear stale documents and refresh recovers', async () => {
        offline = true; $('documents-refresh').click();
        await until(() => $('documents-page').textContent === 'No documents loaded', 'error state');
        assert.equal($('explorer-documents').children.length, 0);
        offline = false; $('documents-refresh').click();
        await until(() => $('explorer-documents').children.length === 10, 'recovery');
    });
});
