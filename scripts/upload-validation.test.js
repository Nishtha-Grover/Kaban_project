import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUpload, validateUploadMetadata } from '../server/services/uploadValidation.js';
import { MAX_ATTACHMENT_BYTES } from '../server/models/Attachment.js';
import { saveUpload } from '../server/services/uploads.js';

const file = (name, mime, content) => ({ originalname: name, mimetype: mime,
    buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });

test('accepts UTF-8 text, CSV, JSON and case-insensitive extensions', () => {
    for (const item of [file('Notes.TXT', 'text/plain', 'Hello नमस्ते\n'),
        file('data.csv', 'text/csv', 'title,priority\nReport,high'),
        file('data.json', 'application/json', '{"tasks":[]}')]) {
        assert.equal(validateUpload(item).size, item.buffer.length);
    }
});
test('requires allowed extension, matching MIME and sensible filename', () => {
    for (const item of [file('code.html', 'text/html', 'html'), file('a.pdf', 'text/plain', 'text'),
        file('a.txt.exe', 'text/plain', 'text'), file('a.txt', 'application/octet-stream', 'text')]) {
        assert.throws(() => validateUpload(item), { status: 415 });
    }
    for (const name of ['../a.txt', 'a\\b.txt', 'a\u202etxt.txt', ' a.txt', 'a\n.txt', 'a'.repeat(256) + '.txt']) {
        assert.throws(() => validateUploadMetadata(file(name, 'text/plain', 'text')), { status: 400 });
    }
});
test('rejects spoofed binary signatures, invalid UTF-8, controls and malformed JSON', () => {
    for (const item of [file('a.pdf', 'application/pdf', 'fake'), file('a.png', 'image/png', 'fake'),
        file('a.jpg', 'image/jpeg', 'fake'), file('a.txt', 'text/plain', Buffer.from([0xc3, 0x28])),
        file('a.csv', 'text/csv', 'a\0b'), file('a.json', 'application/json', '{broken}')]) {
        assert.throws(() => validateUpload(item), { status: 415 });
    }
});
test('checks supported binary boundary signatures without claiming full document validation', () => {
    validateUpload(file('a.pdf', 'application/pdf', '%PDF-1.7\nexample\n%%EOF'));
    validateUpload(file('a.jpg', 'image/jpeg', Buffer.from('ffd8ffe00000ffd9', 'hex')));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    validateUpload(file('a.png', 'image/png', png));
    assert.throws(() => validateUpload(file('a.png', 'image/png', png.subarray(0, -1))), { status: 415 });
});
test('enforces empty, exact-limit and over-limit sizes from actual buffer bytes', () => {
    assert.throws(() => validateUpload(file('a.txt', 'text/plain', '')), { status: 400 });
    const exact = file('a.txt', 'text/plain', Buffer.alloc(MAX_ATTACHMENT_BYTES, 65));
    exact.size = 1; // Client/parser metadata cannot bypass the real byte count.
    assert.equal(validateUpload(exact).size, MAX_ATTACHMENT_BYTES);
    assert.throws(() => validateUpload(file('a.txt', 'text/plain', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))), { status: 413 });
});
test('invalid content is rejected before database lookup or writes', async () => {
    await assert.rejects(saveUpload('owner', 'task', file('a.pdf', 'application/pdf', 'fake'), {
        tasks: { findOne: () => assert.fail('must not query') }
    }), { status: 415 });
});
