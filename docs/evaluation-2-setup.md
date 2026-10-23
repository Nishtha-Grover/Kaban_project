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
