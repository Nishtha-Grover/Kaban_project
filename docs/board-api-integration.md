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

The board now uses this client for initial loading, creation, editing, deletion,
and movement. UI success messages and modal closure wait for saved responses and
refresh. Activity shows the latest 50 database audit events. Failed or ambiguous
writes block further changes until reload; no automatic write retries occur.

College Library imports run sequentially. A failure can leave earlier tasks saved;
the UI reports the confirmed count and requires reload before retry. They are not
an atomic batch yet. Legacy browser data remains untouched and is not auto-imported.
Undo and bulk reset are visibly disabled pending transactional server support.
Deployment remains outstanding.

Each task card now has a Files button. Its native modal dialog lists attachments
in pages of 20, uploads one supported file at a time (up to 10 MiB), links to the
authenticated streamed download, and removes a file after explicit confirmation.
Deletion removes metadata and bytes and records activity in one workspace
transaction. Listing and deletion enforce task ownership. Upload errors advise
refreshing before retry because a lost response may follow a committed upload.
File removal is permanent and is not covered by Undo.

`npm run test:frontend:board` exercises actual form submission, dropdown movement,
delete controls, database reloads, dependency rejection, library persistence,
offline failure, lost-response reconciliation, the Files dialog, byte removal,
download content and account-switch isolation with
JSDOM and an isolated real MongoDB/API. It does not replace visual browser checks.
