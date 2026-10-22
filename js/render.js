import { getTasks, getLockState, deleteTask } from './state.js';
import { setupDragAndDrop } from './dragdrop.js';
import { showToast } from './toast.js';

let filters = {
    search: '',
    priority: 'all',
    category: 'all',
    status: 'all',
    special: 'all',
    sort: 'created-desc'
};

export function setBoardFilters(next) {
    filters = { ...filters, ...next };
}

export function getBoardFilters() {
    return { ...filters };
}

export function renderBoard() {
    const tasks = getTasks();
    const cols = {
        todo: document.getElementById('col-todo'),
        inprogress: document.getElementById('col-inprogress'),
        done: document.getElementById('col-done')
    };

    Object.values(cols).forEach(col => { if (col) col.innerHTML = ''; });

    const visibleTasks = applyFilters(Object.values(tasks));
    const counts = { todo: 0, inprogress: 0, done: 0 };

    visibleTasks.forEach(task => {
        counts[task.status] += 1;
        const lockState = getLockState(task.id);
        const card = createTaskElement(task, tasks, lockState);
        cols[task.status]?.appendChild(card);
    });

    ['todo', 'inprogress', 'done'].forEach(status => {
        const countEl = document.getElementById(`count-${status}`);
        if (countEl) countEl.textContent = counts[status];
        if (cols[status] && counts[status] === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-msg';
            const hasTasks = Object.values(tasks).some(task => task.status === status);
            const messages = { todo: 'A fresh start. Add your first task.', inprogress: 'Your next focus session starts here.', done: 'Your finished work will appear here.' };
            empty.textContent = hasTasks ? 'No matches. Try adjusting your filters.' : messages[status];
            cols[status].appendChild(empty);
        }
    });
}

function applyFilters(tasks) {
    const now = new Date();
    const query = filters.search.trim().toLowerCase();

    const filtered = tasks.filter(task => {
        const lockState = getLockState(task.id);
        const searchable = [task.title, task.description, task.category, ...(task.tags || [])]
            .join(' ')
            .toLowerCase();

        if (query && !searchable.includes(query)) return false;
        if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
        if (filters.category !== 'all' && task.category !== filters.category) return false;
        if (filters.status !== 'all' && task.status !== filters.status) return false;

        if (filters.special === 'blocked' && !lockState.locked) return false;
        if (filters.special === 'overdue' && !isOverdue(task, now)) return false;
        if (filters.special === 'due-soon' && !isDueSoon(task, now)) return false;

        return true;
    });

    return filtered.sort((a, b) => {
        switch (filters.sort) {
            case 'due-asc': return compareDates(a.dueDate, b.dueDate);
            case 'priority-desc': return priorityRank(b.priority) - priorityRank(a.priority);
            case 'title-asc': return a.title.localeCompare(b.title);
            case 'created-asc': return new Date(a.createdAt) - new Date(b.createdAt);
            default: return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });
}

function createTaskElement(task, allTasks, lockState) {
    const el = document.createElement('article');
    el.className = 'task-card';
    el.dataset.id = task.id;
    el.dataset.priority = task.priority || 'medium';
    el.draggable = true;

    const visuallyLocked = task.status === 'todo' && lockState.locked;
    if (visuallyLocked) el.classList.add('locked');
    if (task.status === 'done') el.classList.add('completed');

    const top = document.createElement('div');
    top.className = 'card-topline';
    const category = document.createElement('span');
    category.className = 'category-pill';
    category.textContent = task.category || 'General';
    const priority = document.createElement('span');
    const priorityValue = ['low', 'medium', 'high', 'urgent'].includes(task.priority) ? task.priority : 'medium';
    priority.className = `priority-pill priority-${priorityValue}`;
    priority.textContent = priorityLabel(priorityValue);
    top.append(category, priority);

    const header = document.createElement('div');
    header.className = 'task-header';

    const title = document.createElement('h3');
    title.className = 'task-title';
    title.textContent = task.title;

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const editBtn = makeActionButton('Edit', () => window.openTaskModal(task.id));
    const deleteBtn = makeActionButton('Delete', () => {
        const current = getTasks();
        if (!current[task.id]) {
            showToast('This task no longer exists.');
            renderBoard();
            return;
        }
        const dependents = Object.values(current).filter(item => item.dependsOn.includes(task.id));
        const impact = dependents.length
            ? `\n\nIt is a prerequisite for ${dependents.length} task(s):\n${dependents.map(item => `• ${item.title}`).join('\n')}\n\nThose dependency links will be removed.`
            : '';
        if (confirm(`Delete “${current[task.id].title}”?${impact}\n\nYou can restore this change using Undo.`)) {
            deleteTask(task.id);
            showToast('Task deleted. Use Undo to restore it.');
            document.getElementById('undo-btn')?.focus();
        }
    });
    actions.append(editBtn, deleteBtn);
    editBtn.setAttribute('aria-label', `Edit ${task.title}`);
    deleteBtn.setAttribute('aria-label', `Delete ${task.title}`);
    header.append(title, actions);

    el.append(top, header);

    if (task.description) {
        const desc = document.createElement('p');
        desc.className = 'task-desc';
        desc.textContent = task.description;
        el.appendChild(desc);
    }

    if ((task.tags || []).length) {
        const tags = document.createElement('div');
        tags.className = 'tags-row';
        task.tags.slice(0, 4).forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.textContent = `#${tag}`;
            tags.appendChild(chip);
        });
        el.appendChild(tags);
    }

    const meta = document.createElement('div');
    meta.className = 'task-meta';

    if (task.dueDate) {
        const due = document.createElement('time');
        due.dateTime = task.dueDate;
        const overdue = isOverdue(task, new Date());
        due.className = overdue ? 'meta-item overdue' : 'meta-item';
        due.textContent = `${overdue ? 'Overdue ·' : 'Due'} ${formatDate(task.dueDate)}`;
        meta.appendChild(due);
    }

    if (visuallyLocked) {
        const locked = document.createElement('span');
        locked.className = 'meta-item locked-meta';
        locked.textContent = `🔒 Blocked by ${lockState.blockingDeps.length}`;
        meta.appendChild(locked);
    }

    if (meta.children.length) el.appendChild(meta);
    if (task.status === 'done') {
        const completed = document.createElement('span');
        completed.className = 'card-completed-label';
        completed.textContent = '✓ Completed';
        el.appendChild(completed);
    }

    if (task.dependsOn?.length) {
        const depsContainer = document.createElement('div');
        depsContainer.className = 'deps-list';

        task.dependsOn.forEach(depId => {
            const depTask = allTasks[depId];
            const chip = document.createElement('span');
            chip.className = 'dep-chip';
            if (depTask) {
                const done = depTask.status === 'done';
                chip.classList.add(done ? 'done' : 'pending');
                chip.textContent = `${done ? '✓' : '🔒'} ${depTask.title}`;
            } else {
                chip.classList.add('pending');
                chip.textContent = '🔒 Missing dependency';
            }
            depsContainer.appendChild(chip);
        });
        el.appendChild(depsContainer);
    }

    setupDragAndDrop(el);
    return el;
}

function makeActionButton(label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost-action';
    button.textContent = label;
    button.addEventListener('click', event => {
        event.stopPropagation();
        handler();
    });
    return button;
}

export function populateCategoryFilter() {
    const select = document.getElementById('filter-category');
    if (!select) return;
    const current = select.value || 'all';
    const categories = [...new Set(Object.values(getTasks()).map(task => task.category || 'General'))]
        .sort((a, b) => a.localeCompare(b));

    select.innerHTML = '<option value="all">All categories</option>' +
        categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    select.value = categories.includes(current) ? current : 'all';
}

function isOverdue(task, now) {
    if (!task.dueDate || task.status === 'done') return false;
    const due = new Date(`${task.dueDate}T23:59:59`);
    return due < now;
}

function isDueSoon(task, now) {
    if (!task.dueDate || task.status === 'done') return false;
    const due = new Date(`${task.dueDate}T23:59:59`);
    const diff = due - now;
    return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
}

function compareDates(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return new Date(a) - new Date(b);
}

function priorityRank(priority) {
    return { low: 1, medium: 2, high: 3, urgent: 4 }[priority] || 0;
}

function priorityLabel(priority) {
    return { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }[priority] || 'Medium';
}

function formatDate(date) {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00`));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
