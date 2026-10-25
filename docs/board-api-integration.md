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

College Library imports now commit all selected tasks and audits in one database
transaction (up to 100 tasks and the 100 KB request limit). Invalid batches roll
back entirely. A lost response still requires reload to check whether the whole
batch committed; library imports are not automatically retried or deduplicated.
Legacy data can be explicitly previewed/imported without removing its source.

Undo stores one latest task-action snapshot in the database for boards up to 500
tasks. It supports create, edit/move, delete, library import and reset, survives
reload, and does not provide Redo or the old browser's 20-action stack. Restored
tasks retain IDs and get higher versions, preventing stale tabs overwriting them.
Undo/reset require the revision of the displayed workspace. A subsequent workspace
transaction invalidates an older snapshot, including attachment changes, browser
migration, seeding and the current transactional export. Reads of task lists and
history do not invalidate Undo. Board loading verifies matching revisions around
its reads so the undo revision belongs to the displayed task state.

Reset supports up to 500 tasks and requires removing attachments first. It keeps
audit history and can be undone before the next workspace transaction. Larger
boards still support normal CRUD but do not retain an undo snapshot. Snapshots
are private and are excluded from user responses and Database Studio exports.
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
