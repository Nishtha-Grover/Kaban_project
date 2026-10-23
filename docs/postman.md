# Postman API collection — Evaluation 2, stage 62

Import `postman/FlowForge.postman_collection.json` into Postman. The collection
targets `http://127.0.0.1:3000` through its `baseUrl` variable. Keep the same host
throughout the run so the session cookie applies to every request.

## Before running

1. Configure a disposable MongoDB replica set/Atlas test database and JWT_SECRET
   in your local environment. Do not commit those values.
2. Start the server with `npm run dev` in a separate terminal.
3. Use Postman's cookie jar; login sets the HTTP-only session cookie. No Bearer
   token or manually copied JWT is required.
4. Use a test database only. This collection creates accounts and tasks, modifies
   task statuses, deletes its two CRUD test tasks and adds a demo project.

## Request order

Run folders 01, 02 and 03 in order, followed by folder 05. Requests assert their
expected status codes. The registration request generates a fresh username and
password and clears prior task IDs. Login uses those generated credentials.
Successful task requests save IDs and versions for the following requests.

- Authentication: health, registration, login and current account.
- Tasks: creation/listing, rejected dependency cycle, blocked movement, allowed
  completion and movement, blocked reopening, invalid priority and deletion.
- Studio: seeding once, repeat seeding without duplicates, document browsing,
  populate, collection allowlist, aggregation/index status and JSON export.
- End session: logout followed by an expected 401 on a protected endpoint.

If an expected-success request fails, stop and fix that failure before running
dependent requests. A 400/409/401 result is intentional only where the request name
and assertion explicitly expect it. A disconnected database returning 503 is not
a passing test. On a full rerun, start at registration for a fresh account. The
first seed expects 201 and the insights request expects exactly four demo tasks.

## Optional upload checks

Run folder 04 manually after folder 03 and before logout. In its upload request,
choose `postman/fixtures/notes.txt` for the multipart `file` field. The collection
does not embed a local absolute path and does not set a multipart Content-Type
header: Postman must generate the boundary. Successful upload saves attachmentId.
Then run the download and blocked task-deletion requests. For interactive use,
skip this optional folder until a file is selected; do not run all folders blindly.

The uploaded task remains because attachment removal is not implemented yet.
The generated account, audit history and seeded demo tasks also remain. Dispose
of the test database through your normal development cleanup when no longer
needed. The collection deliberately has no destructive whole-database cleanup.

Generated passwords live in Postman collection variables after registration.
Clear username/password and session cookies before sharing/exporting a used
collection. The checked-in collection contains no credentials or tokens.

## Validation status

The JSON structure, request variables and embedded script syntax are checked
locally. The requests have not yet been executed against a live database in
Postman. Authentication/CRUD and dependency/upload integration tests are the next
two planned stages. Browser-to-backend integration remains separate pending work.
