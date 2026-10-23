# Evaluation 2 setup

Evaluation 2 builds on the existing frontend in the same repository. It is under development; the Express server, database and authentication routes arrive in later stages.

## Requirements

Use Node.js 22.9 or newer and npm. Python 3 remains required for the temporary frontend preview. Check installed versions with `node --version`, `npm --version` and `python3 --version`.

## Prepare configuration

From the repository folder, copy `.env.example` to `.env` only if `.env` does not already exist:

```bash
cp -n .env.example .env
npm run config:check
npm run check
```

There are no npm dependencies at this stage. Backend dependencies and the start/dev commands will be introduced with the server, so there are no scripts pointing to a server that does not exist yet.

`PORT` and `HOST` configure the future backend (default 127.0.0.1:3000). `NODE_ENV` accepts development, test or production. Leave `MONGODB_URI` and `JWT_SECRET` blank until their integration stages. Production configuration requires both; a supplied JWT secret must have at least 32 characters. Config checks validate values without printing credentials or connecting to MongoDB.

For JWT setup later, generate a random secret locally with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste it into your local `.env`, not chat or source code. Environment files, dependencies, logs and uploads are excluded from Git; `.env.example` contains placeholders only.

## Preview now

Run `npm run preview` and keep the terminal open. Visit http://127.0.0.1:4173/. This is the existing Python static preview, not the Express backend. It binds only to your own computer. Do not expose this repository-wide development server publicly: it can serve local files, including `.env`. The upcoming Express static routing must expose only frontend files and explicitly exclude server configuration and credentials.

Use a separate terminal tab for commits. If the preview is already running, keep using it rather than starting a second instance on the same port.
