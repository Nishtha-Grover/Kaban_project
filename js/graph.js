/**
 * Checks if adding an edge from `taskId` to `dependencyId` would create a cycle.
 * It does this by checking if `taskId` is reachable from `dependencyId` using DFS.
 * 
 * @param {Object} tasks - The dictionary of all tasks.
 * @param {string} taskId - The ID of the task that wants to add a dependency.
 * @param {string} dependencyId - The ID of the proposed dependency.
 * @returns {Array|null} - Returns an array representing the path if a cycle is found (e.g. ['dep', ..., 'task']), or null if no cycle.
 */
export function wouldCreateCycle(tasks, taskId, dependencyId) {
    if (taskId === dependencyId) {
        return [taskId, taskId]; // Trivial cycle
    }

    const visited = new Set();
    
    // We want to see if we can reach `taskId` starting from `dependencyId`.
    function dfs(currentId, path) {
        if (currentId === taskId) {
            return path;
        }
        
        visited.add(currentId);
        
        const currentTask = tasks[currentId];
        if (currentTask && currentTask.dependsOn) {
            for (const nextId of currentTask.dependsOn) {
                if (!visited.has(nextId)) {
                    const cyclePath = dfs(nextId, [...path, nextId]);
                    if (cyclePath) {
                        return cyclePath;
                    }
                }
            }
        }
        return null;
    }

    return dfs(dependencyId, [dependencyId]);
}

/**
 * Computes the lock state for all tasks.
 * A task is locked if:
 * 1. It is in the 'todo' column.
 * 2. It has at least one dependency that is NOT 'done'.
 * 
 * Note: If a task is 'inprogress' or 'done', we might not consider it 'locked' in the UI sense,
 * but conceptually the movement is blocked. The requirements say:
 * "A locked task (i.e., a task in "To Do" with at least one dependency not yet "Done")"
 * So a task not in "todo" is technically not locked by definition, though you can't move it backwards anyway without other checks.
 * We'll compute a boolean map for all tasks indicating if their dependencies are met.
 * 
 * @param {Object} tasks - The dictionary of all tasks.
 * @returns {Object} - A map of taskId -> { locked: boolean, blockingDeps: array }
 */
export function computeLockStates(tasks) {
    const lockStates = {};

    for (const taskId in tasks) {
        const task = tasks[taskId];
        let isLocked = false;
        const blockingDeps = [];

        if (task.dependsOn && task.dependsOn.length > 0) {
            for (const depId of task.dependsOn) {
                const dep = tasks[depId];
                if (!dep || dep.status !== 'done') {
                    isLocked = true;
                    if (dep) {
                        blockingDeps.push(dep.title);
                    } else {
                        blockingDeps.push(`Unknown Task (${depId})`); // Edge case if data is corrupted
                    }
                }
            }
        }
        
        // As per spec: "a task in "To Do" with at least one dependency not yet "Done""
        // We evaluate dependency fulfillment regardless of the task's current status,
        // because if it is moved backward, we need to know.
        
        lockStates[taskId] = {
            locked: isLocked,
            blockingDeps: blockingDeps
        };
    }

    return lockStates;
}
