# Task transactions — Evaluation 2, stage 51

POST, PATCH and DELETE task routes now run inside `connection.transaction()`.
Dependency checks, task writes and attachment/dependent-task deletion checks use
the same session. A response is sent only after the transaction commits.

Each transaction first increments the owner's internal `workspaceRevision`.
This shared write makes simultaneous mutations within one workspace contend,
so a retried transaction checks dependencies against a new snapshot. Without
this coordination, concurrent edits of different tasks could create a cycle
even if each independently passed its own checks. Different owners use different
User documents. The revision is hidden from user serialization.

Use an Atlas cluster or a MongoDB replica set. Standalone MongoDB does not support
these transactions; the API returns 503 TRANSACTIONS_REQUIRED instead of silently
performing unsafe writes. No new npm package is needed.

Transaction callbacks may run more than once. Keep filesystem operations,
notifications and HTTP responses outside them. Database audit records will be
added to the same session in the next stage. Do not run parallel operations in
the transaction. GET listing remains outside the transaction.

Validation: `node --test scripts/transactions.test.js` checks session propagation,
workspace coordination order, retry behavior, error propagation and hidden
revision fields using test doubles. These are not live rollback tests. Live
MongoDB rollback and simultaneous-request checks still require a configured
replica set/Atlas test database.

Reference: https://mongoosejs.com/docs/transactions.html
