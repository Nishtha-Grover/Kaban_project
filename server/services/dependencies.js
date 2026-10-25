import { taskValidationError } from './taskValidation.js';

// Validate a replacement edge list against an owner-scoped graph snapshot.
export function validateDependencyGraph(rows, taskId, proposed) {
    const id = String(taskId).toLowerCase();
    const dependencies = proposed.map(value => String(value).toLowerCase());
    const fail = message => { throw taskValidationError({ dependsOn: message }); };
    if (new Set(dependencies).size !== dependencies.length) fail('Prerequisites must be distinct.');
    if (dependencies.includes(id)) fail('A task cannot depend on itself.');
    const graph = new Map(rows.map(row => [String(row._id).toLowerCase(), (row.dependsOn || []).map(value => String(value).toLowerCase())]));
    for (const dependency of dependencies) {
        if (!graph.has(dependency)) fail('One or more prerequisites are unavailable in your workspace.');
    }
    graph.set(id, dependencies);
    // Grey nodes are on the current DFS path; black nodes are fully visited.
    // Explicit frames avoid the call-stack limit for long dependency chains.
    const colors = new Map([[id, 1]]);
    const stack = [{ id, index: 0 }];
    while (stack.length) {
        const frame = stack[stack.length - 1];
        const edges = graph.get(frame.id);
        if (frame.index === edges.length) {
            colors.set(frame.id, 2);
            stack.pop();
            continue;
        }
        const next = edges[frame.index++];
        if (!graph.has(next)) fail('A prerequisite chain contains an unavailable task. Repair that chain first.');
        if (colors.get(next) === 1) fail('These prerequisites would create or include a circular dependency.');
        if (!colors.has(next)) {
            colors.set(next, 1);
            stack.push({ id: next, index: 0 });
        }
    }
    return dependencies;
}
