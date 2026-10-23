import { addTask, updateTask, getTask, getTasks } from './state.js';
import { wouldCreateCycle } from './graph.js';
import { showToast } from './toast.js';
import { parseTags, priorityGuidance } from './taskLabels.js';

const modal = document.getElementById('task-modal');
const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const descInput = document.getElementById('task-desc');
const idInput = document.getElementById('task-id');
const priorityInput = document.getElementById('task-priority');
const categoryInput = document.getElementById('task-category');
const dueDateInput = document.getElementById('task-due-date');
const tagsInput = document.getElementById('task-tags');
const depList = document.getElementById('dependency-list');
const errorMsg = document.getElementById('modal-error');
const modalTitle = document.getElementById('modal-title');
const cancelBtn = document.getElementById('modal-cancel');
let returnFocus = null;
const shell = document.querySelector('.app-shell');

export function initTaskForm() {
    priorityInput.addEventListener('change', updateLabelPreview);
    tagsInput.addEventListener('input', updateLabelPreview);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modal-title');
    errorMsg.setAttribute('role', 'alert');
    titleInput.maxLength = 160;
    descInput.maxLength = 3000;
    const heading = modal.querySelector('.modal-header');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close-button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close task form');
    close.addEventListener('click', closeTaskModal);
    heading.appendChild(close);
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeTaskModal();
        }
        if (event.key === 'Tab') {
            const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(element => element.getClientRects().length);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    cancelBtn.addEventListener('click', closeTaskModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeTaskModal();
    });
    form.addEventListener('submit', handleFormSubmit);
    window.openTaskModal = openTaskModal;
}

function openTaskModal(taskId = null) {
    returnFocus = document.activeElement;
    errorMsg.classList.add('hidden');
    form.reset();
    depList.innerHTML = '';

    const tasks = getTasks();
    const suggestions = document.getElementById('category-suggestions');
    suggestions.replaceChildren();
    [...new Set(['General', 'College', 'Personal', 'Project', ...Object.values(tasks).map(task => task.category)])].sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        suggestions.appendChild(option);
    });
    const task = taskId ? getTask(taskId) : null;
    if (taskId && !task) {
        showToast('This task no longer exists.');
        return;
    }

    modalTitle.textContent = task ? 'Edit Task' : 'Create Task';
    idInput.value = task ? task.id : '';

    if (task) {
        titleInput.value = task.title;
        descInput.value = task.description || '';
        priorityInput.value = task.priority || 'medium';
        categoryInput.value = task.category || 'General';
        dueDateInput.value = task.dueDate || '';
        tagsInput.value = (task.tags || []).join(', ');
    }

    for (const id in tasks) {
        if (id === taskId) continue;
        const otherTask = tasks[id];
        const label = document.createElement('label');
        label.className = 'dep-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = id;
        checkbox.checked = Boolean(task && (task.dependsOn || []).includes(id));

        if (taskId) {
            const cyclePath = wouldCreateCycle(tasks, taskId, id);
            if (cyclePath && !checkbox.checked) {
                checkbox.disabled = true;
                const pathTitles = cyclePath.map(cId => tasks[cId]?.title || cId).join(' → ');
                label.title = `Cycle detected: ${pathTitles}`;
            }
        }

        const span = document.createElement('span');
        span.innerHTML = `<strong>${escapeHtml(otherTask.title)}</strong><small>${escapeHtml(otherTask.category || 'General')}</small>`;
        label.append(checkbox, span);
        depList.appendChild(label);
    }

    if (Object.keys(tasks).length === (taskId ? 1 : 0)) {
        depList.innerHTML = '<span class="picker-empty">No other tasks available yet.</span>';
    }

    updateLabelPreview();
    modal.classList.remove('hidden');
    shell.inert = true;
    document.body.classList.add('task-dialog-open');
    modal.querySelector('[type="submit"]').textContent = task ? 'Save changes ↗' : 'Create task ↗';
    titleInput.focus();
}

function closeTaskModal() {
    modal.classList.add('hidden');
    shell.inert = false;
    document.body.classList.remove('task-dialog-open');
    const target = returnFocus?.isConnected ? returnFocus : document.getElementById('add-task-btn');
    target?.focus();
}

function handleFormSubmit(event) {
    event.preventDefault();

    const taskId = idInput.value;
    if (taskId && !getTask(taskId)) {
        showError('This task was removed while the editor was open. Close the form and create a new task if needed.');
        return;
    }
    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    if (!title) {
        showError('Title is required.');
        titleInput.focus();
        return;
    }

    const selectedDeps = Array.from(
        depList.querySelectorAll('input[type="checkbox"]:checked')
    ).map(checkbox => checkbox.value);

    if (taskId) {
        const tasks = getTasks();
        for (const depId of selectedDeps) {
            const cyclePath = wouldCreateCycle(tasks, taskId, depId);
            if (cyclePath) {
                showError(`Cannot depend on “${tasks[depId].title}”. It creates a cycle.`);
                return;
            }
        }
    }

    const tags = parseTags(tagsInput.value);
    if (tags.length > 6 || tags.some(tag => tag.length > 30)) {
        showError('Use no more than 6 unique tags, with at most 30 characters each.');
        tagsInput.focus();
        return;
    }
    const taskData = {
        title,
        description,
        priority: priorityInput.value,
        category: categoryInput.value.trim() || 'General',
        dueDate: dueDateInput.value,
        tags,
        dependsOn: selectedDeps
    };

    if (taskId) {
        try {
            updateTask(taskId, taskData);
        } catch (error) {
            if (error.name !== 'TaskDependencyError') throw error;
            showError(error.message);
            return;
        }
        showToast('Task updated');
    } else {
        addTask(taskData);
        showToast('Task created');
    }

    closeTaskModal();
}

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
}

function updateLabelPreview() {
    document.getElementById('priority-help').textContent = priorityGuidance[priorityInput.value] || '';
    const preview = document.getElementById('tag-preview');
    preview.replaceChildren();
    parseTags(tagsInput.value).slice(0, 6).forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = `#${tag}`;
        preview.appendChild(chip);
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
