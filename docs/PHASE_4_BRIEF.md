Build Phase 4 (Dashboard). FIRST save this brief verbatim to docs/PHASE_4_BRIEF.md and reference it from the Resume point. Then read AGENTS.md, docs/PROGRESS.md, docs/PHASE_5_BRIEF.md, and docs/BUILD_SPEC.md sections 6, 7, 8, 10.5, 11 (including §11.6) and 17. Work efficiently; do not re-run the seed.

Build per §10.5:
- Sticky filter bar (date range presets, vehicle type, claim type, city, channel, garage type; reset; filters in the URL).
- KPI strip with sparklines, then the 20 charts in the §10.5 table, each in a card with title, subtitle, info tooltip, menu (Export PNG, Export CSV, View as table), skeleton, empty state, and click-through drill-down to the Home claims list with matching filters.
- GET /api/stats/dashboard computes everything from claims.json at request time (never hard-coded), so claims filed in the app appear immediately (§11.6).
- Agent performance and human override charts read the real pipeline_runs.json and audit data from Phase 5.
- ECharts themes from design tokens for light and dark; charts resize correctly on sidebar collapse and theme change.
- Visual quality must match the approved Home page: reuse KpiCard, Sparkline, SegmentedControl, tint tokens, Reveal, TanStack Query and URL state conventions. Use ui-ux-pro-max for layout and chart choices and the motion skill/MCP for animations.

Acceptance: changing any filter updates all charts consistently; totals match Home KPIs for the same range; drill-down opens the correct filtered list; both themes; 1366×768 and 1920×1080; backend tests using the isolated data fixture; pytest -v, npm run build, npm run contrast pass; no console errors.

Follow the usage-safe method in AGENTS.md. Stop at the end with a summary, an honest list of anything incomplete, and a test checklist. Do not commit.
DASHBOARD QUALITY BAR (mandatory):
- Invoke ui-ux-pro-max before designing: get its recommendations for an enterprise insurance analytics dashboard (chart types per data shape, layout hierarchy, readability). Our tokens and colour roles override its palette.
- Layout: KPI strip first, then sections with clear headings (Volume, Money, Fraud, Operations, Geography & partners, AI performance, Year-on-year), arranged on the 12-column grid so related charts sit side by side at equal heights.
- Every chart: consistent palette from tokens (blue primary series, orange for highlights, status colours only for status), ₹ in Indian format (₹4.2 L / ₹3.1 Cr) on axes and tooltips, clean card-style tooltips, readable 12px+ labels, no clutter (light gridlines, no 3D, no unnecessary legends), and a one-line insight under each title computed from the data (e.g. "Fraud savings up 18% vs prior 90 days").
- Motion (via the motion skill/MCP): section entrance stagger once per session; charts animate in on first view; smooth morph transitions when filters change; hover highlight on linked series. Respect reduced motion.
- Both themes must look equally polished (dark charts on neutral charcoal, not navy).
- Check with screenshots in both themes before finishing and fix anything cramped, truncated, or hard to read.
