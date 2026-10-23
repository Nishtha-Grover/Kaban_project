# Multer uploads — Evaluation 2, stage 54

POST `/api/tasks/:taskId/attachments` with an authenticated session cookie and a
multipart form containing exactly one `file` field. Success returns 201 with
attachment metadata (id, task, originalName, mimeType, size, createdAt).

Authentication and task ownership are checked before Multer buffers the file.
Ownership is checked again inside the workspace transaction. The parser bounds
uploads to one file, 10 MiB and no additional fields. Empty files are rejected.
Stage 55 restricts files to PDF, PNG, JPG/JPEG, TXT, CSV and JSON. Filename
extensions must agree with the declared MIME type. Names with paths, control
characters, bidirectional overrides or surrounding spaces are rejected.
Multer rejects disallowed metadata before buffering; the service then checks the
actual buffer length and content before database access. Binary files must have
matching boundary signatures (including PNG IHDR/IEND); text must be valid UTF-8
without binary control characters, and JSON must parse successfully.

Signature checks are format screening, not full document decoding or malware
scanning. PDF scripts, CSV formulas and text contents are not sanitized. Downloads
must be served as attachments with nosniff rather than executed or embedded.
Uploads currently have no public download route.

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

Tests: `node --test scripts/uploads.test.js scripts/upload-validation.test.js`
exercise real multipart parsing (including oversized payloads), filename/MIME
checks, signature mismatches, UTF-8/JSON validation and exact service size limits,
without a listening server, plus service behavior with persistence test doubles.
Live authenticated HTTP and MongoDB transaction checks remain pending.
