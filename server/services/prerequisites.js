import { taskValidationError } from './taskValidation.js';

function blocked(message) {
    return Object.assign(new Error(message), {
        status: 409, code: 'TASK_CONFLICT', fields: { status: message }
    });
}

// Check the resulting task, including edits that change status and links together.
export async function enforcePrerequisites(tasks, owner, task, changes) {
    const status = changes.status ?? task.status;
    const dependencies = changes.dependsOn ?? task.dependsOn;
    if (!['todo', 'inprogress', 'done'].includes(status)) {
        throw taskValidationError({ status: 'Choose To do, In progress or Done.' });
    }
    // Check every write to an active/completed task. Metadata edits must not
    // silently preserve broken prerequisite state left by old/imported data.
    if (status !== 'todo' && dependencies.length) {
        const completed = await tasks.countDocuments({ owner, _id: { $in: dependencies }, status: 'done' });
        if (completed !== dependencies.length) {
            throw blocked('Finish all prerequisites, or move this task back to To do.');
        }
    }
    if (task.status === 'done' && status !== 'done') {
        const activeDependent = await tasks.exists({
            owner, dependsOn: task._id, status: { $in: ['inprogress', 'done'] }
        });
        if (activeDependent) throw blocked('Move active dependent tasks back to To do before reopening this task.');
    }
}
