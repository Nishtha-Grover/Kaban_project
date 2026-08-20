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
    draggedElement = event.currentTarget;
    event.dataTransfer.setData('text/plain', draggedElement.dataset.id);
    event.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => draggedElement.classList.add('dragging'));
}

function handleDragEnd() {
    draggedElement?.classList.remove('dragging');
    draggedElement = null;
    document.querySelectorAll('.column').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(event) {
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
    const task = getTask(taskId);
    if (!task || task.status === newStatus) return;

    if (newStatus === 'inprogress' || newStatus === 'done') {
        const lockState = getLockState(taskId);
        if (lockState.locked) {
            const deps = lockState.blockingDeps.map(title => `“${title}”`).join(', ');
            showToast(`Blocked: ${task.title} is waiting on ${deps}.`);
            return;
        }
    }

    updateTaskStatus(taskId, newStatus);
}
