# Evaluation 1 assessment guide

This branch enhances the existing Evaluation 1 project. It preserves the original history and adds 33 planned enhancement stages. Before the final stage is committed, the branch contains 11 Vaishnavi, 11 Gargi and 10 Nishtha commits relative to main. The final preparation commit belongs to Nishtha, bringing the planned total to 11 each.

## Run locally

From the FlowForge repository folder:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Keep that terminal open and visit http://127.0.0.1:4173/. If the browser cannot connect, check that this server is still running. Use a separate terminal for Git commands.

## Lectures 1–24: code to explain during assessment

| Lectures | Concepts | Project examples |
| --- | --- | --- |
| 1–4 | Variables, types, conversions, operators, conditions | `js/taskModel.js`, `js/deadlines.js`: normalize values and validate deadlines |
| 5–8 | Loops, functions, parameters, return values | `js/graph.js`: iterative DFS and cycle paths |
| 9–12 | Arrow functions, scope, arrays and iteration | `js/state.js`: workspace state, undo snapshots and activity arrays |
| 13–14 | Higher-order functions and array methods | `js/taskSort.js`, `js/render.js`: sorting, filters and card rendering |
| 15–16 | Objects, destructuring and JSON | `js/state.js`, `js/taskModel.js`, `data/student-tasks.json` |
| 17–20 | DOM selection, creation, traversal and styles | `js/render.js`, `js/dashboard.js`, `js/graphView.js` |
| 21 | Mouse, keyboard, form events and preventDefault | `js/taskForm.js`, `js/dragdrop.js`, `js/app.js` |
| 22 | Form handling, validation and error messages | Login/signup pages, `js/formValidation.js`, `js/taskForm.js` |
| 23 | Browser persistence and sessions | `js/auth.js`, `js/state.js`, `js/theme.js`: localStorage; sessionStorage is not the persistence mechanism used here |
| 24 | ES6 modules, templates, spread and defaults | Module imports throughout; task updates, rendering templates and helper defaults |

The table maps applied concepts; it does not claim that every syntax variant in the lecture list is needed or used.

## Demo and manual acceptance checklist

Use disposable demo accounts and tasks. These steps still require a browser pass before merging.

- [ ] Open landing, signup and login at desktop width, 768px and 375px. Check text, buttons and illustrations do not overlap.
- [ ] Register a demo user; check missing/invalid fields and password confirmation. Log out and log in again.
- [ ] Create tasks A and B with B depending on A. Check B cannot move to In progress until A is Done.
- [ ] Attempt a circular dependency. Check it is rejected; inspect the dependency graph.
- [ ] Move B to In progress. Check A cannot be reopened until B returns to To do.
- [ ] Edit and delete a task, undo the operation, and verify dashboard totals and activity history.
- [ ] Try overdue, today and future deadlines; search, priorities, tags, category filters and sorting.
- [ ] Open College Task Library. Search, select visible, clear selection and import two templates. Check selected items remain selected when searching.
- [ ] Use Tab/Shift+Tab within both dialogs and Escape to close. Verify focus returns to the opening control.
- [ ] Refresh and verify tasks persist. Log into another demo user and check its board is separate.
- [ ] Toggle dark/light mode, refresh and verify the preference. Check reduced-motion settings.
- [ ] On mobile, open the menu, use task movement dropdowns, scroll the graph and use all modal controls. Check no unintended page-wide horizontal scrolling.

## Validation recorded on 23 October 2026

Passed: syntax checks for all 21 JavaScript modules; local module import paths; unique HTML IDs and local script/style references; dependency-cycle checks including a 20,000-node chain; prerequisite movement/reopening rules; calendar deadlines; sorting without input mutation; dashboard metric calculation; parsing the eight library templates; Git whitespace checks.

These are code-level checks, not an end-to-end browser result. Automated browser launch was unavailable in this environment. The manual checklist above remains pending. Original screenshots in `docs/screenshots/` predate the redesigned interface.

## Evaluation 2 boundary

This version stores demo users and workspaces in the browser. Passwords are stored as plaintext for the client-side exercise; use demo credentials. There is no server authentication or MongoDB persistence yet.

Weather Promises and the library's Fetch/async-await loading already exist as introductory overlap with lectures 25–28. Evaluation 2 will build on them with error handling and a reusable API client, then add Node/Express, environment configuration, MongoDB/Mongoose, bcrypt, JWT cookies, owner access, CRUD APIs, dependency validation, transactions, audit records, file uploads/downloads, Database Studio, populate, aggregation/index demonstrations, API tests and setup documentation. These backend features are not claimed complete by this Evaluation 1 handoff.

Keep the individual commits when merging the enhancement branch if the assessment requires each stage to remain visible. Review and complete the browser checklist before merging.
