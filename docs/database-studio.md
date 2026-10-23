# Database Studio — stage 57

Open `/studio.html`, or choose Database Studio from the workspace sidebar.
The schema guide is public. Stage 58 adds an authenticated, read-only document
explorer above it. Database records are never available without a server session.

The layout includes five collection selectors, a field table/JSON type outline,
relationship explanations, privacy notes, light/dark themes, responsive layouts
and reduced-motion support. Schema information is curated frontend documentation;
keep it in sync when backend models change. The connection label reads the real
`/api/health` endpoint, times out after five seconds and offers a retry button.
It distinguishes API failure from a disconnected database.

Stage 58 adds authenticated owner-scoped document browsing. Populate and
aggregation/index showcases follow in stages 59–60. The roadmap labels those
features as planned; the schema guide is fully usable without MongoDB.

## Document explorer — stage 58

GET `/api/studio/collections/:collection?page=1&limit=10` supports only users,
tasks, activities, attachments and blobs. All queries include the session owner;
users returns only the current account. The API explicitly projects public fields
and filters the response again. Password hashes, workspace revisions, storage
keys and file bytes are excluded, including in the blob metadata view.

Page size defaults to 10, maximum 50; page number is bounded at 10,000. Unknown
collections and extra query parameters return 400. Counts and pages are separate
reads and can change while another request modifies the workspace.

The UI supports collection selection, expandable JSON documents, pagination,
refresh, empty/error states and a database sign-in form. Responses are rendered
as text, and switching collections cancels stale requests. Login uses the existing
HTTP-only cookie API; passwords are cleared after submission and never persisted
by Studio. A configured database account is required; Evaluation 1 localStorage
accounts/tasks are not migrated here. Account registration and full board/API
integration remain later work. Blob browsing exposes metadata only.

`node --test scripts/explorer.test.js` verifies owner filters, secret exclusion,
pagination and rejected query injection with test doubles. Live database browsing
still requires MongoDB/JWT setup and an authenticated database account.
