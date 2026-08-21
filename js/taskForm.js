import { addTask, updateTask, getTask, getTasks } from './state.js';
import { wouldCreateCycle } from './graph.js';
import { showToast } from './toast.js';

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

export function initTaskForm() {
    cancelBtn.addEventListener('click', closeTaskModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeTaskModal();
    });
    form.addEventListener('submit', handleFormSubmit);
    window.openTaskModal = openTaskModal;
}

function openTaskModal(taskId = null) {
    errorMsg.classList.add('hidden');
    form.reset();
    depList.innerHTML = '';

    const tasks = getTasks();
    const task = taskId ? getTask(taskId) : null;

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

    modal.classList.remove('hidden');
    titleInput.focus();
}

function closeTaskModal() {
    modal.classList.add('hidden');
}

function handleFormSubmit(event) {
    event.preventDefault();

    const taskId = idInput.value;
    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    if (!title) {
        showError('Title is required.');
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

    const taskData = {
        title,
        description,
        priority: priorityInput.value,
        category: categoryInput.value.trim() || 'General',
        dueDate: dueDateInput.value,
        tags: tagsInput.value
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean)
            .slice(0, 6),
        dependsOn: selectedDeps
    };

    if (taskId) {
        updateTask(taskId, taskData);
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

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
