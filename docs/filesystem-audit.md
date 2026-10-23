# EventEmitter filesystem audit — Evaluation 2, stage 53

After a task transaction commits, its saved Activity records are published through
Node's EventEmitter (`activity:committed`). The listener uses `fs/promises` and
`path` to create `logs/` and append newline-delimited JSON to `logs/activity.jsonl`.
Writes are queued in order within one Node process and awaited before the request
finishes. Transaction retries discard earlier attempts' pending file records.
Aborted transactions never publish to the file.

Each line contains activityId, owner, task, action and createdAt. Task titles,
descriptions, passwords, tokens and request bodies are deliberately excluded.
The directory/file are created with private permissions where supported. `logs/`
is already Git-ignored and is not exposed by the Express static-file routes.

MongoDB Activity documents remain the authoritative history. Disk failures produce
a generic warning and do not turn a committed task change into an HTTP failure.
This is a best-effort secondary log: a process crash between database commit and
file append can leave a gap. There is no durable delivery queue or log rotation
yet. Multiple server processes do not share this in-memory write queue.

The default file path is for local development. Serverless deployments must not
rely on local disk for durable storage; use MongoDB history and a hosted logging
destination there. Deployment adaptation remains a later step.

Tests: `node --test scripts/filesystem-audit.test.js`. Actual temporary-file tests
verify JSON format, ordering and metadata filtering. Transaction test doubles
verify emission timing and retry/failure handling; they are not live MongoDB tests.
