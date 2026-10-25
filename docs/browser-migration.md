# Import older browser tasks

Open the board and choose **Import older browser tasks**. Select saved data for
the current username, or a FlowForge browser-backup JSON file with a `tasks`
object keyed by old task ID. Review titles, statuses and prerequisite counts.
You can download a task-only backup before choosing **Import reviewed tasks**.
Passwords, browser sessions and old activity are never included in this backup.

Storage is specific to its origin: data saved at port 4173 is not readable from
port 3000. Export it from its original browser/address and select that JSON file.
This importer accepts the browser task format, not Database Studio's export format.

The server maps old task IDs to fresh database IDs, preserves statuses, due dates,
labels and links, and assigns new database creation timestamps. It validates every
task, rejects missing links/cycles and active tasks with unfinished prerequisites,
then saves all tasks, an import audit record and a private deduplication hash in
one transaction. Existing database tasks are never overwritten. Invalid imports
add nothing. Original browser data is never removed.

Limits: 100 tasks and a 100 KB HTTP body, at most 50 distinct imports per account.
The same normalized backup is imported only once per account, including concurrent
requests or retries after a lost response. Modified backups count as distinct and
can add similar tasks; this is not a merge/synchronization tool. Old activity and
attachments are not migrated. Import only data you intend to add to the signed-in
account; a matching old username is a source suggestion, not proof of ownership.

`npm run test:frontend:board` checks the preview/import controls, preserved source
data, dependency remapping, statuses, dates, duplicate retries, and rejection of
missing prerequisites, cycles and invalid records without partial writes.
