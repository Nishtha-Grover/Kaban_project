import { initTheme, toggleTheme } from './theme.js';

const schemas = {
    users: { title: 'Users', description: 'Account identity and workspace ownership.',
        connection: 'One person. One workspace.', relationship: 'Tasks, files and activity records reference their owner’s user ID.', from: 'User', to: 'Tasks',
        privacy: 'Password hashes and the internal workspace revision are excluded from public user serialization.',
        fields: [['_id', 'ObjectId', 'Unique account identifier'], ['username', 'String', 'Unique, normalized account name'], ['displayName', 'String', 'Name shown in the workspace'], ['passwordHash', 'String', 'Private bcrypt hash · excluded by default'], ['workspaceRevision', 'Number', 'Internal transaction coordination'], ['createdAt', 'Date', 'Account creation timestamp'], ['updatedAt', 'Date', 'Last account update']] },
    tasks: { title: 'Tasks', description: 'The work, deadlines and prerequisites behind your board.',
        connection: 'Progress is connected.', relationship: 'Each task belongs to a user. Prerequisites reference other tasks in that same workspace.', from: 'Task', to: 'Task[]',
        privacy: 'Task API queries include the authenticated owner. Dependency checks reject references outside that workspace.',
        fields: [['_id', 'ObjectId', 'Unique task identifier'], ['owner', 'ObjectId', 'Reference → User'], ['title', 'String', 'Task name · up to 160 characters'], ['description', 'String', 'Supporting details'], ['status', 'String', 'todo / inprogress / done'], ['priority', 'String', 'low / medium / high / urgent'], ['category', 'String', 'Task grouping'], ['dueDate', 'String', 'Calendar date · YYYY-MM-DD or empty'], ['tags', 'String[]', 'Up to six unique tags'], ['dependsOn', 'ObjectId[]', 'References → prerequisite tasks'], ['createdAt', 'Date', 'Creation timestamp'], ['updatedAt', 'Date', 'Latest change'], ['__v', 'Number', 'Version used to detect conflicting edits']] },
    activities: { title: 'Activities', description: 'A record of changes, saved alongside the work itself.',
        connection: 'A lasting trace.', relationship: 'Activity records link to a user and optionally a task. Their messages remain after a task is deleted.', from: 'Activity', to: 'Task',
        privacy: 'The server creates audit messages and assigns the authenticated owner. Clients cannot submit their own audit records.',
        fields: [['_id', 'ObjectId', 'Unique event identifier'], ['owner', 'ObjectId', 'Reference → User'], ['task', 'ObjectId', 'Optional reference → Task'], ['action', 'String', 'For example: create, edit, move, delete, upload'], ['message', 'String', 'Readable snapshot of the change'], ['createdAt', 'Date', 'When the event was recorded']] },
    attachments: { title: 'Attachments', description: 'Small metadata documents that describe your uploaded files.',
        connection: 'Files with context.', relationship: 'Each attachment references its task and owner. A generated storage key connects it to private file bytes.', from: 'Attachment', to: 'Task',
        privacy: 'Downloads check ownership of the task, metadata and blob. The private storage key is excluded from public responses.',
        fields: [['_id', 'ObjectId', 'Unique attachment identifier'], ['owner', 'ObjectId', 'Reference → User'], ['task', 'ObjectId', 'Reference → Task'], ['originalName', 'String', 'Validated display filename'], ['storageKey', 'String', 'Private generated key · unique index'], ['mimeType', 'String', 'Validated file MIME type'], ['size', 'Number', 'File size in bytes · maximum 10 MiB'], ['createdAt', 'Date', 'Upload timestamp'], ['updatedAt', 'Date', 'Metadata timestamp']] },
    blobs: { title: 'File storage', description: 'Private file content, kept separate from readable metadata.',
        connection: 'Separate, together.', relationship: 'The storage key links attachment metadata to its bytes. Both are saved in one transaction.', from: 'Attachment', to: 'Blob',
        privacy: 'Binary data is excluded from default queries. The schema guide never requests or displays stored file bytes.',
        fields: [['_id', 'ObjectId', 'Unique storage document identifier'], ['storageKey', 'String', 'Unique key matching attachment metadata'], ['owner', 'ObjectId', 'Reference → User'], ['data', 'Buffer', 'Private binary content · excluded by default'], ['createdAt', 'Date', 'Storage timestamp']] }
};

function selectCollection(key) {
    const schema = schemas[key];
    if (!schema) return;
    for (const button of document.querySelectorAll('[data-collection]')) {
        button.setAttribute('aria-pressed', String(button.dataset.collection === key));
    }
    for (const [id, value] of Object.entries({ 'collection-title': schema.title,
        'collection-description': schema.description, 'relationship-title': schema.connection,
        'relationship-copy': schema.relationship, 'relation-from': schema.from, 'relation-to': schema.to,
        'privacy-copy': schema.privacy, 'field-count': `${schema.fields.length} documented fields` })) {
        document.getElementById(id).textContent = value;
    }
    const rows = schema.fields.map(field => {
        const row = document.createElement('tr');
        for (const value of field) {
            const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
        }
        return row;
    });
    document.getElementById('schema-fields').replaceChildren(...rows);
    document.getElementById('json-panel').textContent = '// Schema outline — types only, not a stored document\n'
        + JSON.stringify(Object.fromEntries(schema.fields.map(([name, type]) => [name, `<${type}>`])), null, 2);
}

async function checkConnection() {
    const button = document.getElementById('connection-refresh');
    const status = document.getElementById('connection-status');
    const dot = document.getElementById('connection-dot');
    button.disabled = true; status.textContent = 'Checking connection…'; dot.dataset.connected = 'false';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const health = await response.json();
        if (health.status !== 'ok') throw new Error('Unavailable');
        const connected = health.database === 'connected';
        status.textContent = connected ? 'MongoDB connected · schema guide' : 'API online · MongoDB not connected';
        dot.dataset.connected = String(connected);
    } catch { status.textContent = 'API unavailable · schema guide still accessible'; }
    finally { clearTimeout(timer); button.disabled = false; }
}

initTheme();
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
document.getElementById('collection-list').addEventListener('click', event => {
    const button = event.target.closest('[data-collection]');
    if (button) selectCollection(button.dataset.collection);
});
for (const mode of ['fields', 'json']) {
    document.getElementById(`${mode}-view`).addEventListener('click', () => {
        for (const other of ['fields', 'json']) {
            document.getElementById(`${other}-view`).setAttribute('aria-pressed', String(mode === other));
            document.getElementById(`${other}-panel`).hidden = mode !== other;
        }
    });
}
document.getElementById('connection-refresh').addEventListener('click', checkConnection);
selectCollection('users');
checkConnection();
