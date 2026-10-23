# Database Studio — stage 57

Open `/studio.html`, or choose Database Studio from the workspace sidebar.
This stage is a public schema guide, not an authenticated document explorer.
No user records, counts or file bytes are requested or displayed.

The layout includes five collection selectors, a field table/JSON type outline,
relationship explanations, privacy notes, light/dark themes, responsive layouts
and reduced-motion support. Schema information is curated frontend documentation;
keep it in sync when backend models change. The connection label reads the real
`/api/health` endpoint, times out after five seconds and offers a retry button.
It distinguishes API failure from a disconnected database.

Stage 58 will add authenticated owner-scoped document browsing. Populate and
aggregation/index showcases follow in stages 59–60. The roadmap labels those
features as planned; the schema guide is fully usable without MongoDB.
