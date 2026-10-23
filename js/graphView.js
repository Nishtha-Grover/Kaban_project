import { getTasks, getLockState, getTaskDependencies } from './state.js';

export function renderDependencyGraph() {
    const canvas = document.getElementById('dependency-graph');
    if (!canvas) return;

    const tasks = Object.values(getTasks());
    const allTasks = getTasks();
    const summary = document.getElementById('graph-summary');
    const linkCount = tasks.reduce((count, task) => count + (task.dependsOn?.length || 0), 0);
    const missingCount = tasks.reduce((count, task) => count + getTaskDependencies(task.id).missing.length, 0);
    if (summary) summary.textContent = `${tasks.length} tasks · ${linkCount} links${missingCount ? ` · ${missingCount} missing references` : ''}. Select a task to edit it; focus or hover to trace its links.`;
    canvas.innerHTML = '';

    if (!tasks.length) {
        canvas.innerHTML = '<div class="empty-panel large">Add tasks and dependencies to build your graph.</div>';
        return;
    }

    const width = Math.max(canvas.clientWidth || 900, 780);
    const colWidth = width / 3;
    const groups = {
        todo: tasks.filter(task => task.status === 'todo'),
        inprogress: tasks.filter(task => task.status === 'inprogress'),
        done: tasks.filter(task => task.status === 'done')
    };

    const maxRows = Math.max(groups.todo.length, groups.inprogress.length, groups.done.length, 1);
    const height = Math.max(430, maxRows * 130 + 100);
    canvas.style.minHeight = `${height}px`;
    canvas.style.position = 'relative';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-lines');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    canvas.appendChild(svg);

    const positions = Object.create(null);
    const nodes = new Map();
    const edges = [];
    const highlight = id => {
        const related = id ? new Set([id, ...getTaskDependencies(id).prerequisites, ...getTaskDependencies(id).dependents]) : null;
        nodes.forEach((node, key) => node.classList.toggle('graph-muted', Boolean(related && !related.has(key))));
        edges.forEach(({line, source, target}) => {
            line.classList.toggle('graph-traced', Boolean(id && (source === id || target === id)));
            line.classList.toggle('graph-muted', Boolean(id && source !== id && target !== id));
        });
    };
    const statusOrder = ['todo', 'inprogress', 'done'];

    statusOrder.forEach((status, colIndex) => {
        const heading = document.createElement('div');
        heading.className = 'graph-column-label';
        heading.textContent = { todo: 'TO DO', inprogress: 'IN PROGRESS', done: 'DONE' }[status];
        heading.style.left = `${colIndex * colWidth + 20}px`;
        canvas.appendChild(heading);

        groups[status].forEach((task, rowIndex) => {
            const x = colIndex * colWidth + 24;
            const y = 65 + rowIndex * 130;
            positions[task.id] = { x, y, w: colWidth - 48, h: 92 };

            const node = document.createElement('button');
            node.type = 'button';
            node.className = `graph-node ${task.status !== 'done' && getLockState(task.id).locked ? 'locked' : ''}`;
            const dependencies = getTaskDependencies(task.id);
            const description = dependencies.prerequisites.map(id => Object.hasOwn(allTasks, id) ? allTasks[id].title : 'Missing task').join(', ') || 'None';
            node.setAttribute('aria-label', `${task.title}. Prerequisites: ${description}. Edit task.`);
            node.title = `Prerequisites: ${description}`;
            node.addEventListener('click', () => window.openTaskModal(task.id));
            node.addEventListener('mouseenter', () => highlight(task.id));
            node.addEventListener('mouseleave', () => highlight(canvas.contains(document.activeElement) ? document.activeElement.dataset.taskId : null));
            node.addEventListener('focus', () => highlight(task.id));
            node.addEventListener('blur', () => highlight(null));
            node.dataset.taskId = task.id;
            nodes.set(task.id, node);
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            node.style.width = `${colWidth - 48}px`;
            node.innerHTML = `
                <span>${escapeHtml(task.category || 'General')}</span>
                <strong>${escapeHtml(task.title)}</strong>
                <small>${task.status === 'done' ? '✓ Completed' : getLockState(task.id).locked ? '🔒 Blocked' : 'Ready'}</small>
            `;
            canvas.appendChild(node);
        });
    });

    tasks.forEach(task => {
        (task.dependsOn || []).forEach(depId => {
            const from = positions[depId];
            const to = positions[task.id];
            if (!from || !to) return;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const x1 = from.x + from.w;
            const y1 = from.y + from.h / 2;
            const x2 = to.x;
            const y2 = to.y + to.h / 2;
            const mid = (x1 + x2) / 2;
            if (from.x === to.x) {
                const lane = x1 + 18;
                line.setAttribute('d', `M ${x1} ${y1} C ${lane} ${y1}, ${lane} ${y2}, ${to.x + to.w} ${y2}`);
            } else {
                line.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
            }
            line.setAttribute('class', 'graph-edge');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            svg.appendChild(line);
            edges.push({ line, source: depId, target: task.id });
        });
    });

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" class="arrow-head"></polygon>
        </marker>
    `;
    svg.prepend(defs);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
