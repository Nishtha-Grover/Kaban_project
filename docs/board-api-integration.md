# Board API integration progress

Signup and login use the server cookie. `js/taskApi.js` now provides the next
integration layer: loadDatabaseTasks, createDatabaseTask, updateDatabaseTask,
and deleteDatabaseTask. It uses the existing shared Fetch transport and preserves
the server's task ID and version. Updates/deletions require that version; stale
writes fail without automatic retries. Creation sends only supported fields and
the server starts tasks in To Do.

Loading collects all pages before returning any result. A failed page rejects the
whole operation. Pagination is not a snapshot: concurrent changes in another tab
can still change the list during a download; reload to reconcile it.

Run `node --test scripts/task-api-client.test.js` with local MongoDB available.
The live test uses an isolated temporary database to check authentication, CRUD
and stale-version rejection. A separate transport test checks multiple pages and
failure without partial results.

This client is not yet wired into board event handlers. Board tasks remain local
until the next integration update converts state mutations and UI handlers to
await server results. Legacy data migration, undo/import persistence and upload
controls remain separate completion tasks. No browser data is changed by this
preparatory client module.
