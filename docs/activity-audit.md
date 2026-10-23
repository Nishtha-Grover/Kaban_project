# Activity audit records — Evaluation 2, stage 52

Successful task creation, editing, movement and deletion now insert an Activity
document in the same MongoDB transaction as the task change. If inserting the
record fails, the transaction fails too. Failed validation or stale versions do
not produce successful-action records. The owner comes from the authenticated
workspace transaction; clients cannot supply the audit message or action.

Each record contains owner, task reference, action, readable title snapshot and
creation timestamp. A status change is recorded as `move`, including the old and
new statuses; other updates use `edit`. A combined edit and move creates one
move record. Delete history remains after task deletion, so a populated task
reference can later be null. Render messages as text, never as HTML.

Activity indexes are initialized before the server reports database readiness.
Database Studio and frontend history integration are later stages; this change
does not yet replace the browser's localStorage activity history.

Run `node --test scripts/task-audit.test.js scripts/transactions.test.js`.
Tests cover snapshot contents, action selection, owner/session propagation and
failure propagation using test doubles. Live MongoDB atomic rollback remains
to be verified against a configured replica set/Atlas test database.
