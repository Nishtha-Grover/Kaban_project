# Evaluation 2 setup

Evaluation 2 builds on the existing frontend in the same repository. It is under development; the Express HTTP server is available, while database and authentication routes arrive in later stages.

## Requirements

Use Node.js 22.9 or newer and npm. Python 3 remains required for the temporary frontend preview. Check installed versions with `node --version`, `npm --version` and `python3 --version`.

## Prepare configuration

From the repository folder, copy `.env.example` to `.env` only if `.env` does not already exist:

```bash
cp -n .env.example .env
npm run config:check
npm run check
```

Run `npm ci` to install the locked Express dependencies. The `start` and `dev` scripts run the API server; see Stage 38 below.

`PORT` and `HOST` configure the backend (default 127.0.0.1:3000). `NODE_ENV` accepts development, test or production. Leave `MONGODB_URI` and `JWT_SECRET` blank until their integration stages. Production configuration requires both; a supplied JWT secret must have at least 32 characters. Config checks validate values without printing credentials or connecting to MongoDB.

For JWT setup later, generate a random secret locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste it into your local `.env`, not chat or source code. Environment files, dependencies, logs and uploads are excluded from Git; `.env.example` contains placeholders only.

## Preview now

Run `npm run preview` and keep the terminal open. Visit http://127.0.0.1:4173/. This is the existing Python static preview, not the Express backend. It binds only to your own computer. Do not expose this repository-wide development server publicly: it can serve local files, including `.env`. The upcoming Express static routing must expose only frontend files and explicitly exclude server configuration and credentials.

Use a separate terminal tab for commits. If the preview is already running, keep using it rather than starting a second instance on the same port.

## Stage 38: Node HTTP + Express

The API server is now available. Install the locked dependency versions with `npm ci`, then run `npm run dev` for automatic reloads or `npm start` for a normal run. Both read `.env` when present; the development defaults work without one.

Visit http://127.0.0.1:3000/api/health (or your configured port). Expected response:

```json
{"status":"ok","service":"FlowForge API","database":"not-connected"}
```

A health response confirms the HTTP process, not database readiness. Unknown routes return JSON with HTTP 404. JSON request bodies are limited to 100 KB; malformed JSON returns 400 and oversized JSON returns 413. Stop the API with Ctrl+C; it allows active requests to finish with a ten-second shutdown deadline.

Stage 39 adds the frontend at `/` on port 3000. MongoDB, JWT and task endpoints are still pending.


## Stage 39: frontend through Express

With `npm run dev` running, open http://127.0.0.1:3000/. The landing, signup, login and board pages now use the same server as `/api/health`. CSS, browser JavaScript and the College Task Library JSON are served through explicit routes. The repository root is never a static directory: `.env`, `server/`, `scripts/`, `.git/`, package files and documentation are not public routes. Unknown routes return 404.

Port 3000 and port 4173 are different browser origins. Your existing localStorage accounts/tasks on 4173 are not automatically shared with 3000. For this stage, create a new demo account on 3000; your old data remains on 4173. Server authentication and data migration are later work.

Keep the API terminal running and use a separate terminal for Git. Once you have opened the frontend on 3000, you can stop the old Python preview using Ctrl+C in its terminal.

Browser checks: load all four pages; create a demo account; import a library template; confirm `/api/health` still works; confirm `/.env`, `/server/config.js` and `/package.json` return 404 rather than file contents.

## Stage 40: User Mongoose model

Install Mongoose and run the database-independent model checks:

```bash
npm install mongoose@8
node --test scripts/user-model.test.js
npm run check
```

Commit both `package.json` and `package-lock.json` after installation so the team uses the same resolved dependency version. The model is in `server/models/User.js`. Usernames are trimmed, lowercased, 3–32 characters and limited to letters, numbers, underscores and hyphens. Display names are optional and limited to 80 characters. Created/updated timestamps are automatic. A unique username index is declared; actual uniqueness requires index creation in MongoDB and duplicate-key handling in registration.

Only bcrypt-format password hashes are accepted. Hashes are excluded from normal queries and removed from model JSON/object output. Login will explicitly select the hash for comparison; raw/lean query results must never be returned as authentication responses. The model does not hash passwords itself; registration will add bcrypt in the next stage.

The model checks cover normalization, validation, serialization and index declarations without connecting to MongoDB. They do not test persistence, database uniqueness, password hashing or authentication. This stage does not connect the database or change browser-local login; existing demo accounts are not migrated automatically.

## Stage 41: registration and bcrypt

Run `npm install bcrypt@6`, then `node --test scripts/user-model.test.js scripts/registration.test.js`. The registration tests use a fake repository; the last test exercises real bcrypt hashing and comparison. Database persistence and HTTP behavior need separate integration testing with a running MongoDB instance.

`POST /api/auth/register` accepts a JSON object containing `username`, `password` and optional `displayName`. Passwords must have at least eight characters and at most 72 UTF-8 bytes (bcrypt's input limit). The server hashes with cost 12 and returns only user ID, username and display name. It returns 201 on creation, 400 for invalid input, 409 for duplicate usernames and 503 if the database is unavailable. Registration does not create a login session yet.

Copy `.env.example` to `.env` if needed and configure MONGODB_URI to your MongoDB database. With no URI, the frontend still starts but registration returns 503. With a configured URI, startup connects and creates the unique username index before listening; a failed connection or index setup stops startup with a non-secret error. Restart `npm run dev` after changing `.env`. Health now reports the actual database connection state.

Existing HTML signup/login still use demo localStorage authentication. They are not connected to this endpoint yet, and old demo accounts are not migrated. JWT login and frontend integration follow in later stages. Before deployment, authentication endpoints also need abuse/rate-limit controls.

## Stage 42: JWT login and cookies

Install `jsonwebtoken@9`, then run `node --test scripts/user-model.test.js scripts/registration.test.js scripts/session.test.js`. Commit the updated package manifest and lockfile. Configure a random JWT_SECRET of at least 32 characters in `.env` and restart the API. A connected MongoDB database is also required for login.

`POST /api/auth/login` takes JSON username/password and returns public user fields. It sets `flowforge_session`, a one-hour HttpOnly cookie with SameSite=Strict and Path=/. Production sets Secure and therefore requires HTTPS; local HTTP development does not set Secure. The token uses HS256 with an explicit issuer, audience and user ID subject. Tokens are not returned in JSON or stored in browser localStorage. Wrong usernames and passwords both return the same 401 response.

`POST /api/auth/logout` with JSON `{}` clears the matching cookie and returns 204. Clearing a cookie does not invalidate a previously copied token; it expires after one hour. Server-side revocation is not implemented. Authentication POSTs require application/json and reject requests explicitly marked cross-site. No cross-origin CORS access is enabled.

Session tests use a fake user repository for password checks and real JWT signing/verification for token checks. Live HTTP cookies, database login, HTTPS deployment and frontend integration remain to be checked. The next stage adds authentication/owner middleware. HTML login still uses the original demo flow until frontend integration.

## Stage 43: authentication and owner access

`GET /api/auth/me` is now protected. It verifies the session cookie and checks that the account still exists, then returns only the public user fields. Missing, malformed, expired or invalid sessions return 401. A validly formatted cookie with unavailable authentication configuration/database returns 503. This does not convert the demo HTML login into API login yet.

`requireAuth` attaches a trusted `req.user`. `requireOwnedDocument` is reusable middleware for the forthcoming task/attachment routes: it queries by both document ID and authenticated owner ID, ignores client-supplied owner fields, returns 400 for malformed IDs and returns the same 404 for missing or non-owned records. Retrieved documents go into `res.locals.ownedDocument`. It must run after authentication. List/create/update handlers must also enforce ownership when they are implemented; this helper alone does not protect routes that do not use it.

Run `node --test scripts/auth-middleware.test.js`. Tests use real JWTs and fake model lookups to check authentication rejection, deleted accounts, owner scoping and malformed IDs. Real MongoDB and HTTP integration tests remain for the API testing stage.

## Stage 44: Task Mongoose schema

`server/models/Task.js` defines owner, title, description, status, priority, category, dueDate, tags and dependency references. It adds timestamps and optimistic concurrency for document saves. Dates stay as validated YYYY-MM-DD calendar strings so a deadline does not shift across time zones. Owner/status and owner/date indexes are declared for board and deadline queries.

Run `node --test scripts/task-model.test.js` for database-independent validation checks. Task saves reject missing owners, invalid enum values, impossible dates, duplicate/oversized tags, self dependencies and repeated dependency IDs. Unknown fields are rejected. Route handlers must assign ownership from authentication and validate request types before Mongoose casting.

ObjectId references alone do not enforce foreign-key integrity. Dependency existence, matching owners, cycle detection and prerequisite completion are upcoming API rules, not guarantees of this schema. Task endpoints, index creation in the connected database and browser integration are still pending. Existing localStorage tasks remain unchanged.
