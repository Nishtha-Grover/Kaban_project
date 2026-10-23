import { getTasks, getActivities, getLockState } from './state.js';
import { daysUntil, deadlineLabel, isOverdue } from './deadlines.js';
import { calculateMetrics } from './metrics.js';

export function renderDashboard() {
    const tasks = Object.values(getTasks());
    const { total, todo, inprogress, done, blocked, ready, progress } = calculateMetrics(tasks, getLockState);

    setText('metric-total', total);
    setText('metric-todo', todo);
    setText('metric-progress', inprogress);
    setText('metric-done', done);
    setText('metric-blocked', blocked);
    setText('progress-percent', `${progress}%`);
    setText('progress-summary', total
        ? `${done} of ${total} tasks completed · ${ready} ready to start · ${blocked} waiting on prerequisites`
        : 'Create your first task to start tracking progress.');

    const bar = document.getElementById('progress-bar-fill');
    if (bar) bar.style.width = `${progress}%`;
    const progressTrack = document.getElementById('dashboard-progress');
    if (progressTrack) {
        progressTrack.setAttribute('aria-valuenow', String(progress));
        progressTrack.setAttribute('aria-valuetext', `${done} of ${total} tasks completed`);
    }

    renderUpcoming(tasks);
    renderRecentActivity();
}

function renderUpcoming(tasks) {
    const container = document.getElementById('upcoming-list');
    if (!container) return;

    const upcoming = tasks
        .filter(task => daysUntil(task.dueDate) !== null && task.status !== 'done')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));

    if (!upcoming.length) {
        container.innerHTML = '<div class="empty-panel">No upcoming deadlines.</div>';
        return;
    }

    container.replaceChildren();
    const now = new Date();
    const groups = [
        ['Needs attention', upcoming.filter(task => isOverdue(task, now))],
        ['Today & coming up', upcoming.filter(task => !isOverdue(task, now))]
    ];
    for (const [label, items] of groups) {
        if (!items.length) continue;
        const heading = document.createElement('h4');
        heading.className = 'deadline-group-heading';
        heading.textContent = `${label} · ${items.length}`;
        container.appendChild(heading);
        items.slice(0, 5).forEach(task => {
            const row = document.createElement('div');
            row.className = 'deadline-row';
            const copy = document.createElement('div');
            copy.className = 'deadline-copy';
            const title = document.createElement('strong');
            title.textContent = task.title;
            const category = document.createElement('span');
            category.textContent = task.category || 'General';
            copy.append(title, category);
            const details = document.createElement('div');
            details.className = 'deadline-details';
            const time = document.createElement('time');
            time.dateTime = task.dueDate;
            time.textContent = deadlineLabel(task, now);
            if (isOverdue(task, now)) time.className = 'deadline-overdue';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'text-button';
            edit.textContent = 'Edit ↗';
            edit.setAttribute('aria-label', `Edit deadline for ${task.title}`);
            edit.addEventListener('click', () => window.openTaskModal(task.id));
            details.append(time, edit);
            row.append(copy, details);
            container.appendChild(row);
        });
        if (items.length > 5) {
            const more = document.createElement('p');
            more.className = 'deadline-overflow';
            more.textContent = `${items.length - 5} more in this group. Open your board to see all tasks.`;
            container.appendChild(more);
        }
    }
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
    container.replaceChildren();
    const summary = document.createElement('p');
    summary.className = 'timeline-summary';
    summary.textContent = `${activities.length} recent events · Your workspace keeps the latest 60 events.`;
    container.appendChild(summary);
    const groups = new Map();
    [...activities].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).forEach(activity => {
        const date = new Date(activity.createdAt);
        const valid = !Number.isNaN(date.getTime());
        const label = valid ? new Intl.DateTimeFormat('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(date) : 'Unknown date';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(activity);
    });
    for (const [label, events] of groups) {
        const section = document.createElement('section');
        section.className = 'timeline-group';
        const heading = document.createElement('h3');
        heading.textContent = label;
        const list = document.createElement('ol');
        list.className = 'timeline-events';
        events.forEach(activity => {
            const item = document.createElement('li');
            item.innerHTML = activityMarkup(activity);
            const labels = {create:'Created',edit:'Edited',move:'Moved',delete:'Deleted',import:'Imported'};
            const badge = document.createElement('span');
            badge.className = 'timeline-type';
            badge.textContent = labels[activity.type] || 'Updated';
            item.querySelector('.activity-copy').prepend(badge);
            list.appendChild(item);
        });
        section.append(heading, list);
        container.appendChild(section);
    }
}

function activityMarkup(activity, full = false) {
    const icon = {
        create: '+',
        edit: '✎',
        move: '→',
        delete: '×',
        import: '⇩'
    }[activity.type] || '•';

    const date = new Date(activity.createdAt);
    const time = Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat('en-IN', {
        day: full ? 'numeric' : undefined,
        month: full ? 'short' : undefined,
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);

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
