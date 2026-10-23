const titles = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const priorities = { low: 1, medium: 2, high: 3, urgent: 4 };

export function sortTasks(tasks, mode = 'created-desc') {
    return [...tasks].sort((a, b) => {
        let comparison = 0;
        switch (mode) {
            case 'due-asc':
            case 'due-desc':
                // Unscheduled tasks belong at the end in either direction.
                if (!a.dueDate && b.dueDate) return 1;
                if (a.dueDate && !b.dueDate) return -1;
                comparison = (a.dueDate || '').localeCompare(b.dueDate || '') * (mode === 'due-desc' ? -1 : 1);
                break;
            case 'priority-asc':
            case 'priority-desc':
                comparison = ((priorities[a.priority] || 0) - (priorities[b.priority] || 0)) * (mode === 'priority-desc' ? -1 : 1);
                break;
            case 'title-asc':
            case 'title-desc':
                comparison = titles.compare(a.title, b.title) * (mode === 'title-desc' ? -1 : 1);
                break;
            default:
                comparison = (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (mode === 'created-asc' ? 1 : -1);
        }
        return comparison || titles.compare(a.title, b.title) || String(a.id).localeCompare(String(b.id));
    });
}
