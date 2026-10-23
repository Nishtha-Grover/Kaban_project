import { getTasks, getActivities, getLockState } from './state.js';
import { daysUntil, deadlineLabel, isOverdue } from './deadlines.js';

export function renderDashboard() {
    const tasks = Object.values(getTasks());
    const total = tasks.length;
    const todo = tasks.filter(task => task.status === 'todo').length;
    const inprogress = tasks.filter(task => task.status === 'inprogress').length;
    const done = tasks.filter(task => task.status === 'done').length;
    const blocked = tasks.filter(task => getLockState(task.id).locked).length;
    const progress = total ? Math.round((done / total) * 100) : 0;

    setText('metric-total', total);
    setText('metric-todo', todo);
    setText('metric-progress', inprogress);
    setText('metric-done', done);
    setText('metric-blocked', blocked);
    setText('progress-percent', `${progress}%`);

    const bar = document.getElementById('progress-bar-fill');
    if (bar) bar.style.width = `${progress}%`;

    renderUpcoming(tasks);
    renderRecentActivity();
}

function renderUpcoming(tasks) {
    const container = document.getElementById('upcoming-list');
    if (!container) return;

    const upcoming = tasks
        .filter(task => daysUntil(task.dueDate) !== null && task.status !== 'done')
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 5);

    if (!upcoming.length) {
        container.innerHTML = '<div class="empty-panel">No upcoming deadlines.</div>';
        return;
    }

    container.innerHTML = upcoming.map(task => {
        const label = deadlineLabel(task);
        return `
            <div class="deadline-row">
                <div>
                    <strong>${escapeHtml(task.title)}</strong>
                    <span>${escapeHtml(task.category || 'General')}</span>
                </div>
                <time datetime="${task.dueDate}" class="${isOverdue(task) ? 'deadline-overdue' : ''}">${label}</time>
            </div>
        `;
    }).join('');
}

function renderRecentActivity() {
    const container = document.getElementById('dashboard-activity');
    if (!container) return;
    const activities = getActivities().slice(0, 5);
    if (!activities.length) {
        container.innerHTML = '<div class="empty-panel">Your activity will appear here.</div>';
        return;
    }
    container.innerHTML = activities.map(activity => activityMarkup(activity)).join('');
}

export function renderActivityView() {
    const container = document.getElementById('activity-list');
    if (!container) return;
    const activities = getActivities();
    if (!activities.length) {
        container.innerHTML = '<div class="empty-panel large">No activity yet. Create or move a task to begin.</div>';
        return;
    }
    container.innerHTML = activities.map(activity => activityMarkup(activity, true)).join('');
}

function activityMarkup(activity, full = false) {
    const icon = {
        create: '+',
        edit: '✎',
        move: '→',
        delete: '×',
        import: '⇩'
    }[activity.type] || '•';

    const time = new Intl.DateTimeFormat('en-IN', {
        day: full ? 'numeric' : undefined,
        month: full ? 'short' : undefined,
        hour: 'numeric',
        minute: '2-digit'
    }).format(new Date(activity.createdAt));

    return `
        <div class="activity-row">
            <span class="activity-icon">${icon}</span>
            <div class="activity-copy">
                <strong>${escapeHtml(activity.message)}</strong>
                <span>${time}</span>
            </div>
        </div>
    `;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
