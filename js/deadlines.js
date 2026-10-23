// Compare calendar dates, not elapsed hours (which vary across daylight-saving changes).
export function daysUntil(date, now = new Date()) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
    const today = new Date(0);
    today.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    today.setUTCHours(0, 0, 0, 0);
    return Math.round((parsed - today) / 86400000);
}

export function isOverdue(task, now = new Date()) {
    const days = daysUntil(task.dueDate, now);
    return task.status !== 'done' && days !== null && days < 0;
}

export function isDueSoon(task, now = new Date()) {
    const days = daysUntil(task.dueDate, now);
    return task.status !== 'done' && days !== null && days >= 0 && days <= 3;
}

export function deadlineLabel(task, now = new Date()) {
    const days = daysUntil(task.dueDate, now);
    if (days === null) return 'No due date';
    const formatted = new Intl.DateTimeFormat('en-IN', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${task.dueDate}T00:00:00Z`));
    if (task.status === 'done') return `Due ${formatted}`;
    if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due ${formatted}`;
}
