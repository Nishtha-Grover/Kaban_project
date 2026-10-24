import {
    loadState,
    subscribe,
    resetBoard,
    importTasks,
    undoLastAction,
    canUndo,
    getUndoInfo,
    getTasks
} from './state.js';

import {
    renderBoard,
    setBoardFilters,
    populateCategoryFilter
} from './render.js';

import { initColumns } from './dragdrop.js';
import { initTaskForm } from './taskForm.js';

import {
    requireAuth,
    getSessionUsername,
    logoutUser
} from './auth.js';

import {
    renderDashboard,
    renderActivityView
} from './dashboard.js';

import { renderDependencyGraph } from './graphView.js';

import {
    fetchExternalTasks,
    fetchWeatherByLocation,
    getWeatherLocation
} from './api.js';

import {
    initTheme,
    toggleTheme
} from './theme.js';

import { showToast } from './toast.js';
import { initBrowserMigration } from './browserMigration.js';


let activeView = 'dashboard';
let apiTasks = [];
window.addEventListener('error', event => {
    if (event.error?.name === 'TaskDependencyError') {
        event.preventDefault();
        showToast(event.error.message, 8000);
        return;
    }
    if (event.error?.name !== 'TaskStorageError') return;
    event.preventDefault();
    showToast(event.error.message, 12000);
    const notice = document.getElementById('storage-notice');
    notice.textContent = event.error.message;
    notice.hidden = false;
});


document.addEventListener('DOMContentLoaded', async () => {

    initTheme();

    try { if (!await requireAuth()) return; }
    catch (error) {
        const notice = document.getElementById('storage-notice');
        notice.textContent = `${error.message} Reload this page to retry.`; notice.hidden = false;
        return;
    }

    const username = getSessionUsername();

    document.querySelectorAll('[data-current-user]').forEach(el => {
        el.textContent = username || 'User';
    });


    initColumns();
    initTaskForm();
    initBrowserMigration();

    wireNavigation();
    wireBoardControls();
    wireGlobalActions();
    wireImportModal();
    wireWeather();


    subscribe(() => {
        renderEverything();
    });


    try { await loadState(); }
    catch (error) {
        const notice = document.getElementById('storage-notice');
        notice.textContent = error.message + ' Reload this page to retry.';
        notice.hidden = false;
    }

    renderEverything();
    switchView('dashboard');
    // Keep deadline labels current when the workspace stays open overnight.
    let calendarDay = new Date().toDateString();
    const refreshDeadlines = () => {
        const today = new Date().toDateString();
        if (today !== calendarDay) {
            calendarDay = today;
            renderEverything();
        }
    };
    window.setInterval(refreshDeadlines, 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshDeadlines();
    });
});


function renderEverything() {

    populateCategoryFilter();

    renderBoard();

    renderDashboard();

    renderActivityView();

    renderDependencyGraph();

    updateUndoButton();
}


function wireNavigation() {
    const menu = document.getElementById('navigation-toggle');
    const setMenu = open => {
        document.body.classList.toggle('navigation-open', open);
        menu.setAttribute('aria-expanded', String(open));
        menu.textContent = open ? '✕ Close menu' : '☰ Menu';
    };
    menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
            setMenu(false);
            menu.focus();
        }
    });
    window.matchMedia('(max-width: 900px)').addEventListener('change', () => setMenu(false));

    document.querySelectorAll('[data-view-target]').forEach(button => {

        button.addEventListener('click', () => {

            switchView(button.dataset.viewTarget);
            if (menu.getAttribute('aria-expanded') === 'true') {
                setMenu(false);
                menu.focus();
            }

        });

    });

}


function switchView(view) {

    activeView = view;
    const labels = { dashboard: 'Dashboard', board: 'Kanban Board', graph: 'Dependencies', activity: 'Activity' };
    document.getElementById('workspace-current').textContent = labels[view] || 'Workspace';


    document.querySelectorAll('.app-view').forEach(section => {

        section.classList.toggle(
            'active',
            section.dataset.view === view
        );

    });


    document.querySelectorAll('[data-view-target]').forEach(button => {
        if (button.closest('.side-nav')) {
            if (button.dataset.viewTarget === view) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }

        button.classList.toggle(
            'active',
            button.dataset.viewTarget === view
        );

    });


    const titles = {

        dashboard: [
            'Dashboard',
            'A clear view of your work, deadlines and momentum.'
        ],

        board: [
            'Kanban Board',
            'Plan work, manage dependencies and keep tasks moving.'
        ],

        graph: [
            'Dependency Graph',
            'See how tasks connect and what is blocking progress.'
        ],

        activity: [
            'Activity',
            'A timeline of changes across your workspace.'
        ]

    };


    const [title, subtitle] =
        titles[view] || titles.dashboard;


    document.getElementById(
        'page-title'
    ).textContent = title;


    document.getElementById(
        'page-subtitle'
    ).textContent = subtitle;


    if (view === 'graph') {

        requestAnimationFrame(
            renderDependencyGraph
        );

    }

}


function wireBoardControls() {

    const search =
        document.getElementById('search-input');

    const priority =
        document.getElementById('filter-priority');

    const category =
        document.getElementById('filter-category');

    const special =
        document.getElementById('filter-special');

    const sort =
        document.getElementById('sort-tasks');


    const update = () => {
        document.querySelectorAll('[data-quick-filter]').forEach(button => {
            const selected = button.dataset.quickFilter === special.value;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });

        setBoardFilters({

            search: search.value,

            priority: priority.value,

            category: category.value,

            special: special.value,

            sort: sort.value

        });


        renderBoard();

    };


    search.setAttribute('aria-label', 'Search task titles, descriptions, categories and tags');
    priority.setAttribute('aria-label', 'Filter by priority');
    category.setAttribute('aria-label', 'Filter by category');
    special.setAttribute('aria-label', 'Filter by deadline or blocked status');
    sort.setAttribute('aria-label', 'Sort tasks');
    document.getElementById('clear-filters').addEventListener('click', () => {
        search.value = '';
        priority.value = category.value = special.value = 'all';
        update();
        search.focus();
    });
    document.querySelectorAll('[data-quick-filter]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.quickFilter === special.value));
    });
    search.addEventListener(
        'input',
        update
    );


    [
        priority,
        category,
        special,
        sort
    ].forEach(element => {

        element.addEventListener(
            'change',
            update
        );

    });


    document
        .querySelectorAll('[data-quick-filter]')
        .forEach(button => {

            button.addEventListener('click', () => {

                const target =
                    button.dataset.quickFilter;


                special.value = target;


                document
                    .querySelectorAll('[data-quick-filter]')
                    .forEach(otherButton => {

                        otherButton.classList.toggle(
                            'active',
                            otherButton === button
                        );

                    });


                update();

            });

        });

}


function wireGlobalActions() {

    document
        .getElementById('logout-btn')
        .addEventListener(
            'click',
            async () => { try { await logoutUser(); } catch (error) { showToast(error.message, 8000); } }
        );


    document
        .getElementById('add-task-btn')
        .addEventListener(
            'click',
            () => window.openTaskModal()
        );


    document
        .getElementById('hero-add-task')
        .addEventListener(
            'click',
            () => window.openTaskModal()
        );


    document
        .getElementById('import-task-btn')
        .addEventListener(
            'click',
            openImportModal
        );


    document
        .getElementById('theme-toggle')
        .addEventListener(
            'click',
            toggleTheme
        );


    document
        .getElementById('reset-board-btn')
        .addEventListener('click', () => {

            if (
                confirm(
                    'Reset the entire board? You can undo immediately afterwards.'
                )
            ) {

                resetBoard();

                showToast(
                    'Board reset'
                );

            }

        });


    const undo = () => {
        const info = getUndoInfo();
        if (undoLastAction()) showToast(`Undone: ${info.label}`);
        else showToast('Nothing to undo');
    };
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.addEventListener('keydown', event => {
        if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return;
        if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
        if (document.querySelector('.modal:not(.hidden)') || !canUndo()) return;
        event.preventDefault();
        undo();
    });

}


function updateUndoButton() {

    const button =
        document.getElementById('undo-btn');


    button.disabled =
        !canUndo();
    const info = getUndoInfo();
    button.textContent = info.count ? `↶ Undo (${info.count})` : '↶ Undo';
    button.title = info.count ? `Undo: ${info.label}. Up to 20 changes in this session. Ctrl/⌘ Z.` : 'Database undo is not available yet.';
    button.setAttribute('aria-label', info.count ? `Undo: ${info.label}` : 'Nothing to undo');

}


function wireImportModal() {

    const modal =
        document.getElementById('import-modal');

    const confirmBtn =
        document.getElementById('import-confirm');

    const taskList =
        document.getElementById('api-task-list');


    document
        .getElementById('import-cancel')
        .addEventListener('click', () => {

            closeImportModal();

        });


    modal.addEventListener(
        'click',
        event => {

            if (event.target === modal) {

                closeImportModal();

            }

        }
    );


    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeImportModal();
        }
        if (event.key === 'Tab') {
            const controls = [...modal.querySelectorAll('button, input')].filter(element => !element.disabled && element.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first?.focus();
            }
        }
    });

    const updateSelection = () => {
        const count = taskList.querySelectorAll('input:checked').length;
        confirmBtn.disabled = count === 0;
        confirmBtn.textContent = count ? `Import ${count} selected` : 'Import selected';
        document.getElementById('library-selection').textContent = `${count} task${count === 1 ? '' : 's'} selected`;
    };
    taskList.addEventListener('change', updateSelection);
    document.getElementById('library-search').addEventListener('input', event => {
        const query = event.target.value.trim().toLowerCase();
        taskList.querySelectorAll('.api-task-option').forEach(option => {
            option.hidden = !option.textContent.toLowerCase().includes(query);
        });
        const visible = [...taskList.querySelectorAll('.api-task-option')].filter(option => !option.hidden).length;
        document.getElementById('api-status').textContent = `${visible} templates match. Selections stay selected while searching.`;
    });
    document.getElementById('library-select-visible').addEventListener('click', () => {
        taskList.querySelectorAll('.api-task-option').forEach(option => {
            if (!option.hidden) option.querySelector('input').checked = true;
        });
        updateSelection();
    });
    document.getElementById('library-clear').addEventListener('click', () => {
        taskList.querySelectorAll('input').forEach(input => input.checked = false);
        updateSelection();
    });

    confirmBtn.addEventListener(
        'click',
        async () => {

            /*
             * Get IDs of ONLY selected checkboxes.
             */
            const selectedIds =
                Array.from(
                    taskList.querySelectorAll(
                        'input[type="checkbox"]:checked'
                    )
                )
                    .map(input =>
                        String(input.value)
                    );


            /*
             * Filter the API task list
             * and keep ONLY selected tasks.
             */
            const selectedTasks =
                apiTasks.filter(task =>

                    selectedIds.includes(
                        String(task.externalId)
                    )

                );


            if (
                selectedTasks.length === 0
            ) {

                showToast(
                    'Select at least one college task'
                );

                return;

            }


            /*
             * Import ONLY the selected tasks.
             */
            if (confirmBtn.disabled) return;
            confirmBtn.disabled = true;
            let count;
            try { count = await importTasks(selectedTasks); }
            catch (error) {
                document.getElementById('api-status').textContent = error.message;
                return;
            }


            if (count > 0) {

                closeImportModal();


                showToast(
                    `${count} college task${count === 1 ? '' : 's'} imported`
                );


                switchView(
                    'board'
                );

            }

        }
    );

}


let libraryLoadVersion = 0;

function closeImportModal() {
    libraryLoadVersion += 1;
    document.getElementById('import-modal').classList.add('hidden');
    document.querySelector('.app-shell').inert = false;
    document.body.classList.remove('library-dialog-open');
    document.getElementById('import-task-btn').focus();
}

async function openImportModal() {
    const loadVersion = ++libraryLoadVersion;

    const modal =
        document.getElementById('import-modal');

    const list =
        document.getElementById('api-task-list');

    const status =
        document.getElementById('api-status');

    const confirmBtn =
        document.getElementById('import-confirm');


    modal.classList.remove(
        'hidden'
    );
    document.querySelector('.app-shell').inert = true;
    document.body.classList.add('library-dialog-open');
    document.getElementById('library-search').focus();


    apiTasks = [];
    list.innerHTML = '';
    document.getElementById('library-search').value = '';
    document.getElementById('library-selection').textContent = '0 tasks selected';
    confirmBtn.textContent = 'Import selected';


    status.className =
        'api-status loading';


    status.textContent =
        'Loading college task library…';


    /*
     * Button starts disabled.
     * It becomes enabled only after
     * a checkbox is selected.
     */
    confirmBtn.disabled = true;


    try {

        const loadedTasks = await fetchExternalTasks();
        // Closing/reopening must not let an older request overwrite this dialog.
        if (loadVersion !== libraryLoadVersion) return;
        apiTasks = loadedTasks;


        status.className =
            'api-status success';


        status.textContent =
            apiTasks.length ? `${apiTasks.length} college tasks available. Select the tasks you want to add.` : 'No templates are available in the college library yet.';


        list.innerHTML =
            apiTasks
                .map(task => `

                    <label class="api-task-option">

                        <input
                            type="checkbox"
                            value="${escapeHtml(task.externalId)}"
                        >

                        <span>

                            <strong>
                                ${escapeHtml(task.title)}
                            </strong>

                            <span class="library-description">${escapeHtml(task.description)}</span>
                            <small>
                                ${escapeHtml(task.course || 'General')}
                                ·
                                ${escapeHtml(task.category || 'College')}
                                ·
                                ${escapeHtml(
                                    capitalize(
                                        task.priority || 'medium'
                                    )
                                )}
                                Priority
                            </small>

                        </span>

                    </label>

                `)
                .join('');


    } catch (error) {

        if (loadVersion !== libraryLoadVersion) return;
        status.className = 'api-status error';
        status.textContent = error.message || 'Could not load the college task library.';
        list.replaceChildren();
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'secondary';
        retry.textContent = 'Retry loading library';
        retry.addEventListener('click', openImportModal);
        list.appendChild(retry);

        confirmBtn.disabled = true;

    }

}


function wireWeather() {
    const button = document.getElementById('weather-button');
    const copy = document.getElementById('weather-copy');
    const temperature = document.getElementById('weather-temp');
    copy.setAttribute('role', 'status');
    button.addEventListener('click', () => {
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        temperature.textContent = '—';
        copy.textContent = 'Getting your location…';
        getWeatherLocation()
            .then(coords => {
                copy.textContent = 'Loading local weather…';
                return fetchWeatherByLocation(coords.latitude, coords.longitude);
            })
            .then(weather => {
                temperature.textContent = `${weather.temperature}°C`;
                copy.textContent = weather.description;
            })
            .catch(error => { copy.textContent = error.message; })
            .finally(() => {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            });
    });
}


function capitalize(value) {

    const text =
        String(value);


    return (
        text.charAt(0).toUpperCase()
        +
        text.slice(1)
    );

}


function escapeHtml(value) {

    return String(value)

        .replaceAll(
            '&',
            '&amp;'
        )

        .replaceAll(
            '<',
            '&lt;'
        )

        .replaceAll(
            '>',
            '&gt;'
        )

        .replaceAll(
            '"',
            '&quot;'
        )

        .replaceAll(
            "'",
            '&#039;'
        );

}
