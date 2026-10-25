/** Build forward and reverse links without changing persisted task records. */
export function buildDependencyIndex(tasks) {
    const prerequisites = new Map();
    const dependents = new Map();
    const missing = new Map();
    for (const id of Object.keys(tasks)) dependents.set(id, []);
    for (const [id, task] of Object.entries(tasks)) {
        const links = [...new Set(Array.isArray(task.dependsOn)
            ? task.dependsOn.filter(value => typeof value === 'string' && value.length > 0)
            : [])];
        prerequisites.set(id, links);
        const absent = [];
        for (const prerequisite of links) {
            if (!Object.hasOwn(tasks, prerequisite)) absent.push(prerequisite);
            else dependents.get(prerequisite).push(id);
        }
        if (absent.length) missing.set(id, absent);
    }
    return { prerequisites, dependents, missing };
}
