import { EventEmitter } from 'node:events';
import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultFile = fileURLToPath(new URL('../../logs/activity.jsonl', import.meta.url));

// MongoDB remains the authoritative audit. This local file is a secondary log.
export function createFilesystemAudit({ file = defaultFile, makeDirectory = mkdir,
    append = appendFile, warn = () => console.warn('Filesystem audit unavailable; database history is preserved.')
} = {}) {
    const events = new EventEmitter();
    let pending = Promise.resolve();
    events.on('activity:committed', records => {
        // Allowlist metadata: never write titles, passwords, cookies or request bodies.
        const lines = records.map(record => JSON.stringify({
            activityId: String(record._id), owner: String(record.owner),
            task: record.task == null ? null : String(record.task), action: record.action,
            createdAt: new Date(record.createdAt).toISOString()
        })).join('\n') + '\n';
        pending = pending.then(async () => {
            await makeDirectory(dirname(file), { recursive: true, mode: 0o700 });
            await append(file, lines, { encoding: 'utf8', mode: 0o600 });
            return true;
        }).catch(() => { warn(); return false; });
    });
    return {
        async publish(records) {
            if (!records.length) return true;
            try { events.emit('activity:committed', records); return await pending; }
            catch { warn(); return false; }
        }
    };
}

export const filesystemAudit = createFilesystemAudit();
