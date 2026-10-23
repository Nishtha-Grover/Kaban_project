import { updateTaskStatus, getLockState, getTask } from './state.js';
import { showToast } from './toast.js';

let draggedElement = null;

export function setupDragAndDrop(cardElement) {
    cardElement.addEventListener('dragstart', handleDragStart);
    cardElement.addEventListener('dragend', handleDragEnd);
}

export function initColumns() {
    document.querySelectorAll('.column').forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(event) {
    if (event.target.closest('button, select, input')) {
        event.preventDefault();
        return;
    }
    draggedElement = event.currentTarget;
    event.dataTransfer.setData('text/plain', draggedElement.dataset.id);
    event.dataTransfer.effectAllowed = 'move';
    const card = draggedElement;
    requestAnimationFrame(() => { if (draggedElement === card) card.classList.add('dragging'); });
}

function handleDragEnd() {
    draggedElement?.classList.remove('dragging');
    draggedElement = null;
    document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(event) {
    if (!draggedElement) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
    }
}

function handleDrop(event) {
    event.preventDefault();
    const column = event.currentTarget;
    column.classList.remove('drag-over');
    if (!draggedElement) return;

    const taskId = draggedElement.dataset.id;
    const newStatus = column.dataset.status;
    handleDragEnd();
    moveTask(taskId, newStatus);
}

export function moveTask(taskId, newStatus) {
    if (!['todo', 'inprogress', 'done'].includes(newStatus)) return false;
    const task = getTask(taskId);
    if (!task || task.status === newStatus) return false;

    if (newStatus === 'inprogress' || newStatus === 'done') {
        const lockState = getLockState(taskId);
        if (lockState.locked) {
            const deps = lockState.blockingDeps.map(title => `“${title}”`).join(', ');
            showToast(`Blocked: ${task.title} is waiting on ${deps}.`);
            return false;
        }
    }

    try {
        updateTaskStatus(taskId, newStatus);
    } catch (error) {
        if (error.name !== 'TaskDependencyError') throw error;
        showToast(error.message, 8000);
        return false;
    }
    const labels = { todo: 'To do', inprogress: 'In progress', done: 'Done' };
    showToast(`Moved “${task.title}” to ${labels[newStatus]}.`);
    const card = [...document.querySelectorAll('.task-card')].find(item => item.dataset.id === taskId);
    card?.querySelector('.task-move')?.focus();
    return true;
}
