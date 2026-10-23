import { extname } from 'node:path';
import { TextDecoder } from 'node:util';
import { MAX_ATTACHMENT_BYTES } from '../models/Attachment.js';

const types = new Map([
    ['.pdf', 'application/pdf'], ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
    ['.txt', 'text/plain'], ['.csv', 'text/csv'], ['.json', 'application/json']
]);

export function uploadError(message, status = 400) {
    return Object.assign(new Error(message), { status, code: 'UPLOAD_INVALID' });
}

export function validateUploadMetadata(file) {
    const name = file?.originalname;
    if (typeof name !== 'string' || !name.trim() || name.length > 255
        || /[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(name)
        || name !== name.trim()) throw uploadError('Use a filename without paths, control characters or surrounding spaces.');
    const extension = extname(name).toLowerCase();
    const mimeType = types.get(extension);
    if (!mimeType) throw uploadError('Allowed files: PDF, PNG, JPG, TXT, CSV and JSON.', 415);
    if (file.mimetype !== mimeType) throw uploadError('The filename extension and MIME type must match.', 415);
    return { originalName: name, mimeType, extension };
}

export function validateUpload(file) {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw uploadError('Choose a non-empty file.');
    const bytes = file.buffer;
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw uploadError('File exceeds 10 MiB.', 413);
    const metadata = validateUploadMetadata(file);
    const invalidContent = () => { throw uploadError('File content does not match the declared format.', 415); };
    switch (metadata.extension) {
    case '.pdf':
        if (!/^%PDF-\d\.\d/.test(bytes.subarray(0, 8).toString('ascii'))
            || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) invalidContent();
        break;
    case '.png':
        if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
            || !bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) invalidContent();
        break;
    case '.jpg': case '.jpeg':
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8
            || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) invalidContent();
        break;
    default: {
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { invalidContent(); }
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) invalidContent();
        if (metadata.extension === '.json') {
            try { JSON.parse(text); } catch { invalidContent(); }
        }
    }
    }
    return { ...metadata, size: bytes.length };
}
