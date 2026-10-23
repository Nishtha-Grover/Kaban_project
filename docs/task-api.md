# Task API — stages in progress

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
