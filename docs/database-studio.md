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

## Relationship showcase — stage 59

Enable “Resolve relationships with populate” in the document explorer to request
`expand=relationships`. Without this parameter, reference IDs remain unchanged.
Expanded documents show readable relationship summaries and the resulting JSON.

Mongoose populate resolves owner on tasks, activities, attachments and blob
metadata; task prerequisites on tasks; and task on activities/attachments. Users
have no outgoing references in this view. All paths and projections are fixed
server-side. Every populated user matches the authenticated account ID; every
populated task matches the authenticated owner. Nested response fields are also
allowlisted, so password hashes, storage keys and blob bytes cannot leak through
relationship expansion. There is no recursive dependency expansion.

Deleted or unavailable singular references appear as null, and unavailable
prerequisites are omitted from arrays. Activity messages remain readable after
task deletion. The populate view consists of multiple database reads, not an
atomic snapshot; concurrent changes may appear on the next refresh.

`node --test scripts/populate.test.js scripts/explorer.test.js` verifies scope,
projections, nested filtering, raw ID mode and missing references using test
doubles. Live MongoDB populate results still require the database connection.

## Aggregation and indexes — stage 60

Authenticated GET `/api/studio/insights` accepts no query parameters. Its fixed
aggregation starts with the authenticated owner's ObjectId and uses `$facet`,
`$group`, `$sum`, `$cond`, `$size`, `$sort` and `$limit` to summarize task status,
priority, top five categories, completed tasks and dependency links. Empty
workspaces return zero totals; failures never masquerade as empty workspaces.
The aggregation has a five-second execution limit.

Studio displays these live metrics as cards and bars, plus an explanation of the
pipeline stages. An authenticated user can refresh after signing in or changing
tasks. Until connected, the UI shows an error/sign-in state, not sample counts.

The index panel compares Task schema index definitions with `listIndexes()` from
MongoDB, including compound key order and uniqueness. It reports installed vs
missing for owner/status and owner/dueDate indexes. These are collection-level
metadata shared by all workspaces; report counts remain owner-scoped. It does not
run explain, benchmark performance or claim a query used a particular index.

`node --test scripts/studio-insights.test.js` checks owner casting, output limits,
empty data, index comparison and error propagation with test doubles. Real
aggregation execution and index inspection still need live MongoDB verification.

## Demo project and JSON export — stage 61

“Add 4 demo tasks” calls authenticated POST `/api/studio/seed` with `{}`. Four
college-showcase tasks form a dependency diamond: planning precedes prototype and
presentation, which both precede final review. All begin in To do. Each creation
uses the normal validation and audit services. Existing tasks remain unchanged.

An internal User.demoSeedVersion marker is claimed under the workspace transaction
lock. The marker, all four tasks and audit records commit together. Repeated calls
return alreadySeeded without duplicates; deleting demo tasks does not reset this
marker. If the client times out, refreshing/retrying is safe. The marker is hidden
from public account serialization and is not a user-supplied field.

GET `/api/studio/export` returns a downloadable JSON snapshot of the signed-in
account, tasks, activities and attachment metadata. Reads are sequential within
the workspace transaction. Explicit field allowlists exclude hashes, internal
markers, private storage keys and binary content. Up to 1,000 records per
collection are supported; larger exports fail with 413 instead of truncating.
This is a metadata export, not a full backup or an implemented restore format.

Both operations require MongoDB transaction support and database authentication.
Browser-only Evaluation 1 tasks are not included until board integration/migration
is implemented. Refresh insights after seeding to update charts.

`node --test scripts/studio-data.test.js` checks generated links, repeat behavior,
failure propagation, export scope and private-field exclusion with test doubles.
Live transaction, retry and export verification remain pending.
