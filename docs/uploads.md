# Multer uploads — Evaluation 2, stage 54

POST `/api/tasks/:taskId/attachments` with an authenticated session cookie and a
multipart form containing exactly one `file` field. Success returns 201 with
attachment metadata (id, task, originalName, mimeType, size, createdAt).

Authentication and task ownership are checked before Multer buffers the file.
Ownership is checked again inside the workspace transaction. The parser bounds
uploads to one file, 10 MiB and no additional fields. Empty files are rejected.
Detailed file-type and content validation is the next stage; uploads currently
have no public download route and MIME metadata is not trusted for execution.

Attachment metadata, private AttachmentBlob bytes and the upload Activity are
saved in one MongoDB transaction. This avoids filesystem orphan files and keeps
storage independent of the development Mac. Bytes are excluded from default
queries and never returned in the upload response. No static uploads directory
is served. The 10 MiB bound leaves room below MongoDB's document size limit.

This stage has no browser upload interface yet. Protected streamed downloads
are stage 56. A deployment may impose smaller request limits; final hosting
configuration must reconcile those limits before publishing. Memory buffering
also requires deployment-level request/concurrency limits for public use.

Multer is installed through package.json/package-lock.json. Other systems use
`npm ci`. Reference: https://expressjs.com/en/resources/middleware/multer/

Tests: `node --test scripts/uploads.test.js` exercises real multipart parsing
without a listening server and service behavior with persistence test doubles.
Live authenticated HTTP and MongoDB transaction checks remain pending.
