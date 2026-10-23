# Task API — stages in progress

## Stage 50: prerequisite completion rules

All updates now pass through `enforcePrerequisites`, which checks the resulting status and prerequisite list together. In progress and Done require every prerequisite to be Done in the same workspace. Missing or foreign references fail that check. Returning a task to To do is allowed without completing its prerequisites. Reopening a Done task is blocked while any owned dependent remains In progress or Done.

The rules also apply to metadata-only edits on active/completed tasks, so old inconsistent data cannot silently pass through an update. To repair such a task, move it to To do or repair its prerequisite list. Conflicts return HTTP 409 with a readable message and `error.fields.status`; invalid statuses return 400. New tasks still start in To do.

Run `node --test scripts/prerequisites.test.js` for status, reopening, replacement-link and repair cases. These tests use controlled database query results. Atomicity across simultaneous requests is still pending the next transaction stage.

## Stage 49: dependency-cycle validation

PATCH now accepts `dependsOn` as a replacement array (send `[]` to remove all prerequisites), along with the current version. The server loads only the authenticated owner's task graph and runs iterative depth-first search. It rejects self links, duplicate IDs, unavailable references and reachable circular chains with a field error for dependsOn. Shared prerequisites in an acyclic graph are permitted. The explicit DFS stack handles long chains without recursive call-stack overflow.

When adding prerequisites to an active/completed task, the resulting prerequisite set must already be complete, unless the same edit moves the task to To do. Existing creation checks still require prerequisites in the same workspace; new tasks cannot be referenced before they exist.

These validations use a graph snapshot. Preventing simultaneous edits to separate tasks from introducing a cycle still requires the upcoming transaction/concurrency stage. Tests cover a 20,000-node chain, indirect cycles, shared dependencies, missing references and owner-scoped update integration with fake database calls. Run `node --test scripts/dependency-cycle.test.js`.

## Stage 48: field-validation responses

Creation and update now share input-type validation before Mongoose casting. Model validation errors return HTTP 400 with `error.code`, a readable `error.message`, and `error.fields` keyed by field name. For example, an impossible date produces `{"error":{"code":"TASK_VALIDATION","message":"Check the highlighted task fields.","fields":{"dueDate":"Use a real date in YYYY-MM-DD format."}}}`. Raw cast errors, submitted objects and internal model details are not echoed.

Mongoose still enforces required fields, enum values, text lengths, valid calendar dates and array rules. The 100-prerequisite cap is now also enforced at schema level. Unsupported fields and empty patches fail before querying the database. Frontend display of these server field errors remains part of API integration.

Run `node --test scripts/task-validation.test.js scripts/task-mutations.test.js scripts/tasks-service.test.js scripts/task-model.test.js` to check the shared validation and existing task behavior without MongoDB.

## Stage 47: update and delete

`PATCH /api/tasks/:id` accepts a JSON object with the current `version` from the task list and at least one editable field: title, description, priority, category, dueDate, tags, status or dependsOn. Example: `{"version":0,"title":"Updated assignment"}`. It returns `{ "task": ... }` with the saved version. Owner/ID/timestamp changes are rejected. Dependency editing was enabled in Stage 49.

`DELETE /api/tasks/:id` accepts JSON `{"version":0}` and returns 204 with no body. Deletion is refused while another task references it or it has attachments. Missing and non-owned tasks both return 404; invalid input returns 400; stale versions and dependency conflicts return 409. Reload the task list after a conflict. These checks avoid silently overwriting a newer edit.

Basic status transitions check completed prerequisites and active dependents. Multi-document checks are not yet transactional: simultaneous dependency/file changes can still race. The scheduled cycle, prerequisite and transaction stages will complete these guarantees before deployment. Audit records are also pending.

Run `node --test scripts/task-mutations.test.js scripts/tasks-service.test.js scripts/task-model.test.js`. Mutation checks use real model validation with fake database operations; live HTTP/MongoDB integration remains pending.

All `/api/tasks` routes require the JWT session cookie, an existing user and a connected database. HTML board integration is still pending; browser-local tasks are not automatically imported.

## Create

`POST /api/tasks` with Content-Type application/json accepts title, description, priority, category, dueDate, tags and dependsOn. New tasks start in `todo`; any other initial status is rejected. Owner, IDs, timestamps and other unsupported fields are rejected. The server assigns the authenticated user as owner.

Example body:

```json
{"title":"Finish assignment","priority":"high","category":"College","dueDate":"2026-10-30","tags":["DSA"],"dependsOn":[]}
```

A successful request returns HTTP 201 with `{ "task": ... }`. Invalid fields return 400. Dependency IDs must refer to existing tasks in the same workspace; missing and non-owned references produce the same error. At most 100 prerequisites are accepted. Creating a fresh task does not alter existing dependency edges. Concurrency protection for dependency modifications and deletion will be addressed in the transaction stage.

## List

`GET /api/tasks?page=1&limit=20&status=todo` returns tasks, page, limit, total and totalPages. Status is optional; default page is 1 and default limit is 20. Limits are capped at 100, and page is capped at 100000. Results are ordered newest first with ID as a tie-breaker. Both the results and count are scoped to the authenticated owner. Unknown query keys, invalid pagination and invalid statuses return 400.

Responses expose task IDs, editable fields, timestamps and version. They do not expose owner or internal Mongoose fields. Separate count and list queries may reflect concurrent changes; they are not a transactional snapshot.

## Validation status

Run `node --test scripts/tasks-service.test.js scripts/task-model.test.js`. Service tests use fake persistence with real Mongoose document validation. They check ownership assignment, rejected fields, prerequisite ownership and list pagination. Live HTTP/MongoDB tests remain pending. Update/delete endpoints, audit recording and frontend integration are later stages. Task indexes are now created during configured database startup.
