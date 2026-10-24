# Evaluation 2 assessment guide

FlowForge extends the Evaluation 1 project in the same repository. This guide
records the state at planned stage 66; it does not claim final integration or
deployment is finished.

## Lecture mapping

| Lectures | Topics | Implementation evidence |
|---|---|---|
| 1–24 | JavaScript foundations, arrays/objects, DOM/events, forms, storage and ES6 | Preserved board, dashboard, task forms, dependency graph and themes; see [Evaluation 1](evaluation-1.md). |
| 25–26 | Callbacks, asynchronous JS, Promises, error handling | `js/api.js` weather flow; `js/httpClient.js`; Node middleware callbacks. |
| 27–28 | async/await, Fetch, REST and JSON | Task library, Studio modules, JSON API requests and export. |
| 29–30 | API mini project with storage/forms | College Task Library and weather integrated into the original workspace. |
| 31 | Node runtime, globals | `server/index.js`, process environment and signal handling. V8/REPL are viva explanations, not application features. |
| 32 | Event loop, nonblocking I/O | Async database work, Fetch and queued `fs/promises` writes; explain callbacks and the call stack during viva. |
| 33 | Modules, filesystem, path | ES modules throughout; `server/services/filesystemAudit.js`; path resolution in `server/frontend.js`. CommonJS is a comparison topic, not the chosen module system. |
| 34 | Buffers, streams, EventEmitter, errors | Attachment buffers, streamed HTTP download pipeline, post-commit EventEmitter audit and error middleware. |
| 35 | HTTP server, requests, routing | Node `createServer` in `server/index.js`, Express API routers. |
| 36 | npm, package.json, environment | Lockfile, npm scripts, `.env.example`, configuration validation. Node `--watch` is used instead of Nodemon. |
| 37–38 | Express, middleware, REST CRUD | Auth/task/upload/Studio routers, JSON parsing, authenticated owner-scoped services. |
| 39 | Validation, errors, JWT, bcrypt, protected routes | Registration/login, HTTP-only cookie, schema/request validation and owner checks. |
| 40 | Multer, Postman | Multipart uploads, size/content checks, Postman collection and live upload tests. |
| 41 | MongoDB/Atlas, schemas, CRUD, validation, populate | User/Task/Activity/Attachment/Blob models, Studio explorer and relationship expansion. Atlas instructions exist; Atlas deployment remains unverified. |

Aggregation, indexes, transactions and dependency concurrency controls extend
the syllabus. Do not describe schema preview content as actual stored documents.

## Suggested demonstration

1. Show the original board and explain the Evaluation 1 browser-storage design.
2. Show Express health and connected MongoDB. Register a database account through
   Postman; sign in separately in Studio's browser form.
3. Add the demo project once, inspect its documents and enable populate. Explain
   how ObjectId references become summaries of related records.
4. Refresh insights. Explain the owner `$match`, grouped counts, facets and actual
   installed index check. Index presence does not prove query speed.
5. Demonstrate CRUD, blocked prerequisites and a rejected cycle through Postman.
6. Upload the sample TXT and download it with the owner cookie. Demonstrate a
   rejected invalid upload and denied cross-account access using the tests.
7. Inspect Activity history and export JSON. Explain why secrets and file bytes
   are excluded, and why filesystem logging happens after transaction commit.
8. Run the three integration-test commands and discuss their actual scope.

## Verified evidence

- Stage 63: six live auth/CRUD scenarios passed with a disposable replica set.
- Stage 64: six live dependency/upload scenarios passed, including concurrent
  opposite edges and real rollback of attachment metadata, bytes and activity.
- Stage 65: seven DOM integration scenarios passed against the real API/database,
  covering sign-in, seed, populate, pagination, insights, export and recovery.
- Earlier unit/service tests and syntax checks passed during each relevant stage.

See [detailed test evidence](api-integration-tests.md). These results are local,
not proof of Atlas, production deployment or full browser visual correctness.

## Team commit checkpoints

The planned Evaluation 2 sequence contains 33 commits: 11 each for Vaishnavi,
Nishtha and Gargi. Immediately before the documentation commit, Git shows 10 for
Vaishnavi and 11 each for Nishtha/Gargi on `evaluation-1-enhancements..HEAD`.
Committing stage 66 under Vaishnavi brings that planned sequence to 11 each.
Review authorship and explain the work actually understood/performed by each
member; commit metadata alone is not evidence of individual contribution.

To inspect the current branch's counts:

```bash
git shortlog -sn evaluation-1-enhancements..HEAD
```

## Outstanding completion work

- Connect board tasks to the task APIs. Signup/login now use database
  authentication, but board tasks still use localStorage scoped to database user ID.
- Decide and implement explicit local-task migration without overwriting user data.
- Integrate task attachment controls and server-backed activity into the board.
- Reconcile undo and College Task Library import with server persistence.
- Add integration tests for those completed board flows and check mobile/visual UI.
- Configure the actual application database/Atlas and verify it through the website.
- Implement hosting adapter/routing, HTTPS configuration and hosting upload limits;
  publish and verify the complete project from another system.
- Review and merge branches after verification; preserve the intended commit history.

These are required completion tasks beyond the numbered commit checklist. The
project must not be presented as fully integrated or deployed until they pass.
