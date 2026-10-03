# Phase 3B brief — Stages 2 and 3 (verbatim from the user, 2026-10-04)

Build Stage 2, stop with a status, and wait for "continue" before Stage 3.

========================================
STAGE 2 — NEW-CLAIM DATA PERSISTENCE (foundation for the live demo)
========================================
New claims filed through the app (the wizard comes in Phase 6) are the centrepiece of the demo. Build and prove the storage path now:
1. Add §11.6 "Data persistence contract" to docs/BUILD_SPEC.md stating:
   - claims.json is the single source of truth; new claims are appended to it with the same schema as seeded claims (§11.2) and IDs continuing the sequence (ABC-MC-<YYYY>-<6 digits>).
   - Uploaded files are stored privately in server/uploads/<claim_id>/ (photos, videos, audio, documents), never in client/public, and served only through an authenticated endpoint (owner or admin) GET /api/files/<claim_id>/<file>.
   - Every upload is processed on arrival: WebP (max 1600px) + thumbnail + blur placeholder for images, EXIF capture time/GPS/device extracted, quality score (blur, brightness), size and type recorded in the claim's media/documents arrays.
   - Every write goes through json_store (atomic, locked) and invalidates caches immediately, so Home KPIs, the claims list, search, the status donut, Needs attention, Recent activity, and later the Dashboard (Phase 4) all include new claims instantly with no restart.
   - Seeded and user-created claims render identically everywhere; the UI never distinguishes them except via an optional "Filed in app" channel badge.
   - Phases 4, 5 and 6 must follow this contract.
2. json_store: add an mtime check (so external edits/reseeds are picked up without restarting uvicorn), move blocking file I/O off the event loop, explicit cache invalidation. Add tests/conftest.py with a fixture that runs every test against a temporary copy of server/data/ and server/uploads/, so tests never modify the real data.
3. Implement per §17: POST /api/claims (create draft), PATCH /api/claims/{id}, POST /api/uploads/{claim_id} (multipart, kind + slot), DELETE /api/uploads/{claim_id}/{media_id}, GET /api/files/{claim_id}/{file} (auth + ownership check), POST /api/claims/{id}/submit (validates, sets status SUBMITTED, adds timeline + audit entries and an admin notification; the agent pipeline is attached in Phase 5). Pipeline outputs (fraud, financials, decision) are nullable until Phase 5 and every view must handle that.
4. Integration test: log in as Rahul, create a claim, upload 2 real test images (with EXIF) and 1 document, submit; verify the claim appears in GET /api/claims (and by search on its ID and registration), its files are retrievable by Rahul and an admin but NOT by another customer or unauthenticated, /api/stats/home totals increase by one, and GET /api/claims/{id} returns the media with thumbnails and EXIF fields.
5. Dev Tools (developer only): a "Create sample in-app claim" button that runs the same flow through the real multipart endpoints with a bundled sample image set, shows a progress log, and links to the new claim.

========================================
STAGE 3 — CLAIM DETAIL PAGE (BUILD_SPEC §10.4)
========================================
Build the full Claim Detail page at /claims/:claimId: sticky header with actions (a compact 72px bar slides in on scroll), flags strip, all 10 tabs (URL-synced), right rail (sticky, 4/12), customer view, graceful states. It must render seeded and user-created claims identically, using the authenticated file endpoint for uploaded media.
- Actions: Approve, Approve revised amount, Request info, Escalate to SIU, Reject, Reassign, Add note. Each opens a confirm modal with preset reasons + a required reason and an effect preview, updates claims.json via POST /api/claims/{id}/actions (status-validity matrix; invalid actions rejected), adds timeline + audit entries, creates a notification, uses optimistic updates with rollback, and shows a toast with Undo (6 s) where reversible. Buttons disabled with a tooltip explaining why when invalid. Results reflect immediately on Home KPIs and lists (invalidate Home queries). Also print-to-PDF and copy link.
- Overview: 2-column cards (Incident, Policy with validity flag, Vehicle with photo + Vahan, Customer with masked KYC card, Garage, AI decision top 3 reasons); long text clamped with "Show more".
- Timeline: vertical rail, newest last, agent events with blue icons, humans with avatars, time since previous event, pipeline events grouped and collapsible.
- Damage: first photo large with tiles; toggleable boxes (green = fresh, red = pre-existing, amber = low confidence/overquoted) with labels; Lightbox (zoom capped at native resolution, pan, arrows, EXIF panel, credit); damage table; 6-slot coverage checklist; EXIF table with match flags. Claims with no AI analysis yet show photos without boxes and an "AI assessment pending" panel.
- Verification: accordion, one card per check (flag, key fields, latency, raw JSON for admins); FASTag card has an ECharts time-axis chart of toll/parking events vs a marker at the reported time, distance in tooltips, mismatches red, "View as table" toggle.
- Fraud Analysis: large gauge and band, waterfall of fired rules stacking to the score (with running-total table fallback), evidence cards deep-linking to photos/checks, not-fired rules in a collapsed green list, network graph only where linked claims exist.
- Financials: AI estimate vs garage quote with variance chip, full line-item table, calculation ladder (Gross parts → … → Net payable) from claim.financials exactly as computed by costing.py, notes on zero-dep, total-loss check vs 75% IDV, NCB impact.
- Documents: checklist grouped Mandatory / Conditional / Optional from document_requirements.json with per-item status; viewer with the document image left and extracted fields with match flags right.
- Media & Uploads: type filter (SegmentedControl), FileTiles with metadata, AudioPlayer with transcript, translation and language, or "Audio not retained".
- Communications: thread with channel icons; AI drafts with a "Draft" badge, editable and sendable; "Regenerate draft" disabled with a tooltip until Phase 5.
- Audit Log: immutable table, actor-type filter, CSV export.
- Right rail: AI summary, recommended decision with confidence, grouped flags (clickable → switch tab, scroll, brief orange outline pulse), key numbers, SLA timer, assignee, internal notes.
- Shared-element transition from the Home row/card (layoutId "claim-<id>") into the detail header (fall back to a 200 ms fade if unreliable with lazy routes, and log the decision); the back link restores Home's full URL and scroll position (sessionStorage). Home's look and behaviour must not change.
- Customer view (Rahul): tabs Overview, Status timeline, Photos & documents, Messages, What happens next; actions "Respond to info request" and "Contact support". The server strips every internal field (including scenario_id, pipeline_run_id, financials.llm_arithmetic_discrepancy, communication drafts, document extraction internals); add a recursive banned-word test (fraud, SIU, risk, rule, score) over his full responses.
- Friendly 404 for unknown claim IDs. Red/amber/green flags always with icon + label. Both themes equally polished. Nothing truncated at 1366×768 or 1920×1080.

ACCEPTANCE
- All 5 demo scenario claims tell their story across the tabs (fastag_mismatch: red FASTag check, high score, SIU route, red pre-existing box; garage_overquote: amber variance + "Approve revised amount"; flood_total_loss: total-loss path with salvage; theft_two_wheeler: info requested with missing items; clean_rear_end: auto pre-auth).
- The Dev Tools sample claim can be found via Home search and Ctrl+K, opened, and shows its uploaded photos and document; Home KPIs reflect it without a restart.
- Every action persists after refresh and appears in Timeline and Audit Log; Undo works.
- Backend tests: each action, invalid-status rejection, audit entries, customer-view safety, file access control, the Stage 2 integration flow. Plain pytest -v passes; npm run build and npm run contrast pass; no console errors.

---
Working constraints given with the brief: do not re-run the full seed (~17 min) unless truly required (ask first); tests use
the isolated temporary data fixture, never the real `server/data/`; one focused browser pass at the end of each stage (both themes,
admin + Rahul); finish every part to a solid spec-compliant standard, polish ideas go to Known follow-ups; keep using ui-ux-pro-max and
the motion skill/MCP for Claim Detail; usage-safe sub-steps per AGENTS.md; do not commit.
