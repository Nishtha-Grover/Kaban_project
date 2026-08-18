import { getTasks, getLockState } from './state.js';

export function renderDependencyGraph() {
    const canvas = document.getElementById('dependency-graph');
    if (!canvas) return;

    const tasks = Object.values(getTasks());
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

    const positions = {};
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

            const node = document.createElement('div');
            node.className = `graph-node ${getLockState(task.id).locked ? 'locked' : ''}`;
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
            line.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
            line.setAttribute('class', 'graph-edge');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            svg.appendChild(line);
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
