# FlowForge setup and Atlas

## One project, two evaluations

Keep using the same repository and project directory. Evaluation 1 supplies the
board and browser interactions; Evaluation 2 adds the Express API, MongoDB models,
transactions, uploads and Studio. Git branches record development stages.

## Install and run

Use Node 26 (tested with 26.5) and npm. The frontend test library jsdom 30 requires
Node 22.22.2+, 24.15.0+, or 26+ within its supported release ranges; the older
package engine minimum alone is not sufficient for every development dependency.

From the repository directory:

```bash
npm ci
cp -n .env.example .env
```

The copy command preserves an existing `.env`. Open that local file in your
editor. Keep NODE_ENV=development, HOST=127.0.0.1 and PORT=3000 for local use.
Set MONGODB_URI using the Atlas procedure below (or your own local replica set).
Generate JWT_SECRET locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into JWT_SECRET in `.env`. Do not paste it into chat,
frontend JavaScript or Git. Then run:

```bash
npm run config:check
npm run check
npm run dev
```

Config validation does not connect to MongoDB. Open `/api/health` on port 3000
and check that database is `connected`. Leave the server terminal open. Use a
second terminal for Git/tests; if you close the server, restart `npm run dev`.
Use `npm start` for a run without Node's file watcher.

## Connect Atlas

1. Create or choose an Atlas project and database cluster.
2. Create a **database user**, distinct from your Atlas website login. Give it
   read/write access to the `flowforge` application database.
3. Add your development machine's current public IP to the project's IP access
   list. Deployment will need access from its own hosting environment.
4. Open the cluster's Connect flow and choose the driver connection instructions.
   Copy the MongoDB URI, insert the database-user credentials and specify the
   `flowforge` database. URL-encode reserved characters in credentials as needed.
5. Put the completed URI only in MONGODB_URI in your local `.env`, then restart
   the server and check `/api/health` again.

See MongoDB's [driver connection guide](https://www.mongodb.com/docs/atlas/driver-connection/)
and [IP access-list guide](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
Atlas setup has not been performed or verified by this project session.

Task writes require transactions: use Atlas or a configured local replica set,
not a standalone mongod. The automated tests start their own disposable replica
set and do not configure the database used by your running website.

## First database account and showcase

Open `/signup.html` to register a database account; successful registration also
signs you in. `/login.html` and Database Studio share the same server session.
Existing browser-only accounts are not imported automatically. The board now saves tasks to the database and displays its latest 50 audit events.
Old browser tasks remain untouched; migration is still pending.
You can also use [Postman](postman.md); its cookie jar is separate from the browser.

Open `/studio.html`, sign in, add the four demo tasks and select Tasks. Inspect
documents, enable populate, refresh insights and download a JSON export.
Database credentials in MONGODB_URI are not application-user credentials.

## Test commands

Install MongoDB locally with `mongod` on PATH to run isolated integration tests.
MONGOD_BINARY can point to its executable if needed. These tests need localhost
socket access and do not require Atlas or your project's `.env`.

```bash
npm run test:api:auth
npm run test:api:files
npm run test:frontend
npm run test:frontend:auth
npm run test:frontend:board
```

See [test evidence and limitations](api-integration-tests.md). DOM tests do not
replace visual/mobile/browser testing. npm installs are for developers and hosts;
visitors to a deployed website do not install Node or MongoDB.

## Troubleshooting

| Symptom | Check |
|---|---|
| Connection refused in browser | Start `npm run dev`; verify port 3000 and leave the terminal open. |
| MongoDB startup failure | URI, database-user credentials, cluster readiness and IP access list. |
| Sign-in unavailable (503) | MongoDB connection and JWT_SECRET; restart after editing configuration. |
| Browser account cannot sign in to Studio | Register through the updated signup page; old localStorage accounts are separate. |
| Transactions required | Use a replica set or Atlas cluster. |
| Port already used | Use the existing server or change PORT; do not terminate unrelated processes. |
| npm dependency engine warning | Use a supported Node version, preferably the tested Node 26. |

## Deployment boundary

No live deployment has been completed. Publishing only the HTML folder to
Netlify will not run this Express server. A serverless adapter/routing layer or a
separate Node host is still required, along with Atlas, server-side environment
variables and verified HTTPS cookies. NODE_ENV=production requires both secrets.

The current frontend expects same-origin `/api` routes. Uploads store bytes in
MongoDB, but the hosting request-size limit must still be reconciled with the
10 MiB application limit. Local filesystem audit logs are secondary and are not
durable serverless storage. Do not publish the repository root as static files;
Express currently exposes only an explicit frontend allowlist.
