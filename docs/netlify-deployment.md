# Deploy the same FlowForge project

The repository includes a Netlify Functions adapter for the Express API. Pages and `/api` share one HTTPS origin, preserving cookie authentication. This is deployment preparation, not evidence of a live deployment.

## First create Atlas

1. Open https://cloud.mongodb.com and create a project named FlowForge.
2. Create a free cluster if that tier is available. Choose a nearby region.
3. Create a database user with access to the FlowForge database. Save its generated password privately.
4. In Network Access, add your current IP for local development.
5. Choose Connect → Drivers → Node.js. Copy the connection string privately; replace the password placeholder and set the database name to `flowforge`. URL-encode special characters in the password.
6. Copy `.env.example` to `.env` only if `.env` does not already exist. Set `MONGODB_URI` there and generate `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never paste either value into chat or commit `.env`.
7. Run `npm run config:check`, then `npm run dev`. Verify `/api/health` reports `connected`, then register and create a task.

## Publish after local verification

Import this GitHub repository into Netlify, selecting the branch containing these changes. The repository's `netlify.toml` supplies the build command, public directory and API rewrite. Use the repository root as the base directory.

In Netlify's environment variables, set `MONGODB_URI`, `JWT_SECRET` and `NODE_ENV=production` for the Functions runtime. Use a separate strong secret for hosting. Redeploy after changing variables. Never put secrets in `netlify.toml` or frontend JavaScript.

Atlas must also allow the deployed function's outbound network access. Prefer fixed outbound IPs when available. If your hosting plan requires the broad `0.0.0.0/0` rule, it allows connection attempts from anywhere: use a dedicated least-privilege database user and a strong password. The local current-IP rule alone does not allow Netlify.

After deployment check health, signup/login, task CRUD, dependencies, undo, Studio, upload/download and a second account on another device. A successful build alone does not verify Atlas access or function packaging.

## Limits

- Hosted uploads and downloads are limited to **3 MiB** to leave room for multipart and base64 overhead in Netlify's buffered function payload. Local Express supports 10 MiB. Older larger files remain in MongoDB and can be downloaded locally.
- Serverless downloads are buffered by the adapter; local Express demonstrates streamed downloads.
- MongoDB is durable storage for tasks, attachments and audit history. The secondary filesystem audit uses temporary storage on Functions and is not durable.
- The adapter reuses database connections in warm instances and returns a generic 503 if configuration or database connection fails.
- Compressed JSON requests are rejected. The installed Express dependency currently has an npm advisory affecting compressed body parsing; keep dependencies reviewed before publishing.

References: https://docs.netlify.com/build/frameworks/framework-setup-guides/express/ and https://docs.netlify.com/build/functions/configuration/
