# Build progress

## Resume point
**Phase 7 — WhatsApp Journey: BUILT + VERIFIED by builder (2026-10-05); awaiting user acceptance.** Kept simple per user.
Details: "Phase 7" section below. pytest 166 pass, `npm run build` OK, `npm run contrast` OK.
**Exact next sub-step:** user runs the Phase 7 checklist; then Phase 8 (Support, settings, polish). **Temporary state:** none.

**Phase 4 — Dashboard: BUILT + VERIFIED by builder (2026-10-05); awaiting user acceptance.** Brief: `docs/PHASE_4_BRIEF.md`.
Details: "Phase 4" section below. pytest 163 pass, `npm run build` OK, `npm run contrast` OK.
**Exact next sub-step:** user runs the Phase 4 test checklist; then the next phase per spec §19 (Phase 7 — WhatsApp Journey).
**Temporary state:** none (dashboard is read-only; `server/data` untouched).

**Phase 6 — File a Claim wizard, Agent Theatre, Results: BUILT + BROWSER-VERIFIED by builder (2026-10-05); awaiting user acceptance.**
Brief (verbatim): `docs/PHASE_6_BRIEF.md`. Details: "Phase 6" section below.
**Last completed sub-step:** 6.5 browser acceptance + fixes; data restored (sha256 manifest match, no extra uploads); pytest 156 pass,
`npm run build` OK, `npm run contrast` OK.
**Exact next sub-step:** user runs the Phase 6 test checklist (voice note, webcam, 1366×768 / 1920×1080 on a real screen); then Phase 7.
**Temporary state:** none. Data = clean backup (`daf354c5…/scratchpad/backup`). NOTE: WIP commit d5c8362 contains test claims
000253/000254 in claims.json — the working tree now removes them (claims/notifications/pipeline_runs differ from HEAD on purpose).
**Constraints:** no full re-seed; tests only on temp data; restore server/data + server/uploads after own testing; do not commit.

## Phase 7 — WhatsApp Journey (2026-10-05)
### Delivered
- `server/scripts/make_whatsapp_scenarios.py` builds `whatsapp_scenarios.json` from real claims (also called at the end of `seed.py`):
  Happy path (238, Hinglish voice note, cashless pre-auth), More info needed (230), Theft (237, Hindi, FIR), Flagged (241, customer-safe
  messages; risk findings + SIU only in `internal` under-the-hood blocks), Settlement & feedback (190). 68 messages, all 11 message types.
- `GET /api/whatsapp/scenarios` (`routers/whatsapp.py`): admins get all five; customers only journeys on their own claims, internal blocks
  removed. `tests/test_whatsapp.py` (3).
- `client/src/features/whatsapp/`: page (scenario picker in the URL, controls, scenario card, "Why WhatsApp" + "Try it in the app"),
  PhoneFrame (390 × 820 scaled to fit, generic chat — no WhatsApp logo), anime.js timer playback (`usePlayback`: play/pause, step, restart,
  0.5×/1×/2×, scrubber with chapter markers; anime.js also animates bubble entrance), UnderTheHood (dark-scoped panel), PNG + key-frame ZIP
  export (html-to-image + JSZip, lazy-loaded). Chat tokens `--chat-*` for light and dark. Dependency added: `jszip`.
### Verification
- Headless Chrome (scratchpad `shots/wa.mjs`, `wa2.mjs`): all five scenarios play to the end (2×; theft at 0.5×), step back/forward and
  chapter jumps work, PNG (≈150 KB) and ZIP (≈260 KB) downloads produced, Rahul sees only his two journeys with no internal content, no
  console errors; light + dark at 1366×768 and 1920×1080.
### Decisions
- Kept simple: journeys are scripted from claim data (not a live chat); chapters exist only where a journey has them (settlement = 1).
- Under-the-hood panel uses the neutral `--panel-dark` (no navy, rule 15) with `data-theme="dark"` so its tokens stay readable in light mode.
- Customers see the page with their own journeys only (other customers' replays would expose their data).
### Known follow-ups
- At 1366×768 the phone scales to ~0.65 so chat text is small (exports are full resolution).
- Voice notes are shown (waveform + transcript) but not playable in the replay.

## Phase 4 — Dashboard (2026-10-05)
### Delivered
- Backend: `services/claim_filters.py` — one filter predicate for the Home claims list and the Dashboard (new list params channel,
  garage_type, garage, city_tier, dow, hour, rule, min_risk/max_risk, outcome, route, date_on; segments settled, verified, assessed,
  human_decided, overridden; risk/fraud/routing filters and internal segments are ignored for customers). `services/dashboard.py` +
  `GET /api/stats/dashboard` (admin; computed from claims.json per request): period presets, 6 KPIs with sparklines and deltas, 20 chart
  datasets each with a computed insight and drill-down links. `tests/test_dashboard.py` (7).
- Frontend `client/src/features/dashboard/`: sticky one-row FilterBar (period dropdown + custom range + 5 multi-selects + reset, URL
  state), compact KPI strip, ChartCard (title, subtitle, info, insight, Export PNG/CSV, View as table, skeleton/empty/error, mount on first
  view, axis-click drill), charts.js (20 builders from tokens), LegendList, GarageLeaderboard, motion.js (section stagger once per session).
  Shared additions (additive, defaults unchanged): echarts funnel/sankey/heatmap/visualMap modules, EChart `onChartReady`, chartTheme
  `bgMuted`/`blue50`, KpiCard `compact`, DateRangePicker `emptyLabel`. Home list accepts the drill-down keys (pills + Clear all).
### Verification
- Tests: FY totals equal the Home KPIs; > 80 drill-down links each equal the list total; filters change every chart consistently;
  presets/buckets; a new claim shows instantly; agent stats read pipeline_runs.json; admin-only; customers cannot probe internal filters.
- Headless Chrome (scratchpad `shots/shoot.mjs`, `drill.mjs`) at 1366×768 and 1920×1080, light + dark: no console errors; filter →
  URL + KPIs update; status-legend drill → Home list with matching pills and equal count; charts resize after Ctrl+B.
### Decisions
- ui-ux-pro-max guidance applied: ≤ 6-slice donuts with labelled legends, sorted bars, funnel shows conversion and highlights the biggest
  drop, Sankey labels always visible, table fallback per chart, no overshoot easing on data views. Its palette/font were overridden by tokens.
- Period is a preset dropdown (not SegmentedControl) so the sticky bar fits one row; extra preset "Last 24 months"; default FY to date.
- Buckets: day ≤ 31 days, week ≤ 120 days, else month. Deltas compare with the previous period of equal length.
- Chart 1 "settled / approved" and chart 19 overrides are dated by decision (`date_on=decided`); chart 20 (YoY) ignores the date range.
- Human override = handler-decided claim whose final pay/deny differs from the AI's pay/deny recommendation ("review" excluded).
- Agent performance: live runs from pipeline_runs.json (fallback = failed step); seeded claims from gaps between agent timeline events and
  `agent_fallback` audit entries. No drill-down (agents are not claims).
- Turnaround chart uses a log axis (minutes for straight-through, days for SIU); values floored at 0.01 h.
- Spans adapted to fill rows: Volume 8+4 / 4+4+4; Money 8+4; Fraud 6+6 / 4+8; Operations 4+5+3 + heatmap 12; Geo 6+6; AI 6+6; YoY 12.
### Known follow-ups
- 1366/1920 checked in headless Chrome only (the interactive Chrome window here is limited to ~1045 px by a side panel).
- Agent-performance x-labels are rotated even at 1920 where they would fit flat.
- Seed data: some claims use a garage from another city (leaderboard shows each garage's own city).

## Phase 6 — File a Claim wizard, Agent Theatre, Results (2026-10-04 → 05)
### Delivered
- 6.1 backend: `routers/wizard.py` (lookup, policyholders, policies, drafts, cities, garages, requirements, scenarios,
  `POST /api/intake/voice`, `POST /api/documents/extract`), `GET /api/pipeline/by-claim/{id}`, PATCH extensions; `tests/test_wizard.py` (12).
- 6.2 wizard `client/src/features/file-claim/`; 6.3 Theatre `features/pipeline/TheatrePage.jsx` at `/processing/:claimId`;
  6.4 results (`ResultView.jsx`: handler = Claim Detail + "Processed by AI in N s" banner; customer = friendly confirmation).
### Browser verification (2026-10-05, builder; Chrome window at 1280×585 CSS px — display is 150 % scaled, so 1366×768 not reachable)
- Rahul, typed English, sample Baleno photos + RC/DL on his Creta policy → live run 39 s; RC/DL match flags shown live in the wizard;
  FR-16 + FR-18 fired (make/model + colour), score 100 → SIU; customer views never mention fraud/score; claim on Home instantly.
  FR-17 correctly did NOT fire (both photos show the same car — FR-17 needs photos of different cars within one claim).
- Admin for Aadi Seth (photos match the insured Baleno) → RC/DL all match → live run 36 s, score 0, auto-decided, pre-auth issued.
- All 5 sample scenarios pre-fill correctly (script-compared each draft with the seeded scenario: narrative in original language,
  type, date/time, city, location, policy, customer, injuries, third party, police, garage; no photos/documents).
- Refresh mid-wizard and mid-Theatre resume; Customer/Handler toggle; dark theme; "I'll provide later" path; Real speed run.
### Fixes made during verification
- Customer view leaked `documents[].quality.blur_score` (banned word "score") → reduced to `{ok}`; regression test added.
- Autosave lost answers clicked < 800 ms before a refresh/step change → flush on every step change + keepalive flush on
  `pagehide`/hidden (`api()` gained `keepalive`).
- Theatre auto-open called `setParams` inside a state updater (React "setState in render" console error) → countdown in state,
  navigation in an effect, robust to timer bursts (`<= 0`).
- Photo-slot "Upload" label clipped at 1280 px → buttons wrap. "Baner Road, Pune, Pune" → `placeText()` dedupes city.
- Result estimate rows now all rounded to ₹10 (§12.9) so they add up (₹37,560 − ₹1,000 = ₹36,560). Plurals ("detail(s)", "photo(s)").
### Decisions
- Builder screenshots of a hidden automation window freeze Motion/anime.js mid-frame (rAF = 0); layout was verified by DOM geometry.
### Known follow-ups
- NOT verified by builder (no microphone/camera in the automation browser): Hindi/Marathi voice note end-to-end, webcam capture.
- Auto-open after the timer-burst fix was not re-run live (the original setState-in-render fix was); check it once in the checklist.
- Garage list for a Creta in Pune offers Kia/Toyota dealers only (network data, not wizard logic).

### Phase 5 decisions (user + builder)
- User: seeded claims (incl. 5 scenarios) are illustrative and untouched; no live identity check on them (UI: "Not assessed (historical
  claim)"). Identity check applies fully to NEW claims. Live re-runs of scenarios dropped; scenarios shown via seed + Demo-mode replay.
- Sample claim switched to the black Maruti Baleno MH 02 DN 8165 (Aadi Seth): both photos are of the same car (front + crop), RC + DL
  specimens, cashless network garage g_008; narrative matches the photo (e-scooter in frame — the first wording was flagged FR-03 live).
- Claim form / policy / KYC are verified digitally (digital FNOL, policy core, CKYC) when not uploaded, as in seeded claims.
- Blocking conditional docs: FIR only for theft/bodily injury; theft originals/keys/RTO declaration; estimate for reimbursement.
- A5.6 "only medium driver is FR-06" = score without FR-06 < 30. A5.7 also blocked by any fired fail-level rule (FR-17 alone is 25 pts).
- FR-07 garage link counts only for non-network garages; FR-08 ignores the stolen flag on theft claims; replays exclude their original.
- Generic fallback = code defaults per agent (they need this claim's photo/doc ids); recorded files only for the 5 scenarios.
- fastag_mismatch replay also fires FR-11 (EXIF GPS in Mumbai) → score 100, still SIU.
- json_store retries os.replace on Windows "Access denied". Test switch AMC_PIPELINE_AUTOSTART=0 (tests drive runs).
- Known data issue: duplicate vehicle id v_0042 in vehicles.json (orchestrator matches id + registration).
- Demo-mode agent call records (`model: "demo"`, no attempts) are stored so the inspector shows each rendered prompt, but are not
  counted as Gemini calls/tokens.
- Identity comparison table: every source column compares what the photos show with that source (the RC plate column used to compare
  the RC with the policy).
- Seeded auto-decided claims show "Decided … by the AI pipeline" (they showed "by a handler"); the right-rail AI summary uses the
  investigation call's `ai_summary` when present, else the field-built summary.

## Stage 1 record (2026-10-03)
**Done this session (2026-10-03):**
- Sub-step 1: `clean_motorcycle.jpg` verified (a 1920×1080 WebP saved with a .jpg name; Pillow reads it). Catalogued as a clean
  Royal Enfield Classic (`model_key` ROY-CLA, body motorcycle, Black, no plate box — the rear plate is edge-on) and built (1600×900).
  `seed_media.for_claim`: two-wheeler body is now a hard filter, so motorcycle claims never show the scooter damage photos (they get no
  damage photos until a motorcycle damage photo exists; thumbnail + theft photo = `clean_motorcycle`). `seed.py`: when a claim's photos
  do not show the insured vehicle (none, or TP), the vehicle colour follows the clean photo; TP claims cost with `idv=0` so a large
  third-party bill no longer turns into an own-vehicle "Total loss" (that bug gave a 2W total loss a car photo). Dry run of `generate()`:
  all 250 claims validate, scenarios unchanged (scores 90/5/35/10/0).
- Sub-step 2: `python scripts/stock_curation.py` + `python scripts/build_stock_photos.py --prune-legacy` → 26 photos.

**Done in the previous session (2026-10-02 → 03, never recorded here):**
- **Photo source switched** from Commons/Openverse discovery to **user-provided photos** in `server/assets_src/photos/` (26 files).
  `fetch_stock_images.py` is kept but unused. New `server/scripts/build_stock_photos.py [--prune-legacy]`: optional crop, plate
  pixelate + blur, WebP ≤ 1600 px (never upscaled) + 320 px thumb + base64 blur placeholder, EXIF/GPS stripped, `CREDITS.json`
  ("Provided by user"), temp folder swapped in via `fs_sync.sync_dir`; writes url/thumb/size/blur back into the manifest.
- `stock_curation.py` rewritten as the catalogue of those photos (25 catalogued: 20 damage + 5 clean; boxes `[ymin,xmin,ymax,xmax]`
  0–1000 on the source, re-expressed relative to `crop` where one is set; kind D = fresh, P = pre-existing; clean photos may carry a
  `model_key`). `car_front_02` carries the pre-existing `BMRF` "oxidised fracture" box (fastag_mismatch FR-02 story).
  `clean_motorcycle.jpg` was not catalogued (the original file was not a real image).
- Build ran with `--prune-legacy`: all 25 photos are in `client/public/assets/stock/<category>/`, the `fallback-*` placeholders and
  the old Commons files are gone (shown as deletions in `git status`).
- `seed_media.py`: no more "unique showcase" reservation — photos are reused evenly; only the five scenarios use distinct curated
  sets. `clean_for()` prefers exact `model_key`, then same body (scooter/motorcycle), then same vehicle type. Champagne colour added.
- `seed.py`: `SCENARIO_PHOTOS` = clean_rear_end → car_rear_01, fastag_mismatch → car_front_02, garage_overquote → car_side_01,
  flood_total_loss → flood_01; theft_two_wheeler shows the clean scooter. Scenario items/narratives rewritten to match the photos
  (e.g. clean_rear_end: bumper + quarter panel + tail lamp; garage_overquote: two left doors, no mirror; Activa is Blue;
  pre-existing bracket points at `m_1`). Summary line now prints "scenario photo sets distinct".
- `render_annotations.py` writes sheets to `server/.cache/stock/review/`.
- `Lightbox.jsx`: zoom capped at the image's native resolution (`naturalWidth / offsetWidth`, ≤ 5×), re-measured on load/resize;
  "+" disabled with the label "Shown at full resolution" when the photo is already at native size. **Not yet verified in a browser.**
- Seed ran to completion once (15:28) with these photos; a second run was interrupted (see temporary state above).

**Remaining Stage 1 sub-steps**
1. Catalogue + build `clean_motorcycle`; motorcycle claims use it.
2. Rebuild the manifest (`python scripts/stock_curation.py` + build) and confirm the `car_front_02` pre-existing box is present.
3. Full `python scripts/seed.py` (foreground, ≥ 15 min timeout; takes ~8½ min). Check `users.json` byte-identical, no
   `documents.__building__`, every document URL exists, no orphan document folders.
4. Fresh uvicorn; browser check: Home thumbnails/cards, 5 scenarios + boxes (red pre-existing box on fastag_mismatch), motorcycle
   claims, Lightbox zoom cap.
5. Stage 1 tests; `pytest -v`, `npm run build`, `npm run contrast`.
6. `server/assets_src/photos/README.md` (how to replace a photo).

Phases and acceptance criteria are defined in `BUILD_SPEC.md` §19.

| Phase | Status |
|---|---|
| 1 — Foundation & design system | ✅ Done (2026-10-01) |
| 2 — Backend core, data & auth | ⚠️ Partly stubbed — see Phase 1–2 audit |
| 3 — Home & Claim Detail | ✅ Done (Home 2026-10-02; Stage 1 photos 10-03; Stage 2 persistence + Stage 3 Claim Detail 10-04) |
| 4 — Dashboard | — |
| 5 — Agents & pipeline | ✅ Done (2026-10-04) — see "Phase 5 — Agents & pipeline" |
| 6 — File a Claim, Agent Theatre, Results | — |
| 7 — WhatsApp Journey | — |
| 8 — Support, settings, polish | — |

## Phase 1 — Foundation & design system

### Delivered
- [x] `client/` scaffold: React 19 + Vite 8 (JS), Tailwind v4 via `@tailwindcss/vite`, React Router 8 (lazy routes +
      hover prefetch), TanStack Query/Table v9/Virtual, Zustand, RHF + Zod (installed), Motion 13, anime.js v4,
      ECharts 6 + echarts-for-react, lucide-react, Sonner, dayjs, html-to-image, self-hosted Inter Variable + JetBrains Mono.
- [x] `server/` scaffold: FastAPI app factory (GZip, CORS, `GET /api/system/status`), `config.py` (pydantic-settings,
      key path resolved relative to `/server`, project id from key file, demo mode when key missing), venv + requirements.
- [x] Tokens in `client/src/styles/tokens.css` (light + dark, `@theme inline` bridge; Tailwind's default palette,
      type scale, radii and shadows are cleared so only tokens exist).
- [x] No-flash theme: inline script in `index.html` sets `data-theme` (and sidebar state) before React mounts.
      Theme toggle uses a View Transitions circular reveal (200 ms crossfade fallback / none with reduced motion).
- [x] Components (§7) in `components/ui/`: Button, IconButton, Card, Badge/CountBadge, StatusFlag, ClaimStatusBadge,
      Collapsible/Accordion, Tabs, Modal, Drawer, Tooltip, Popover, DropdownMenu, Select, Input/Textarea/Field,
      Checkbox, Switch, DateRangePicker, Stepper, Progress, Skeleton, EmptyState, ErrorState, Avatar, KpiCard
      (+ AnimatedNumber), Sparkline, RiskGauge, Lightbox, FileTile, AudioPlayer, Kbd, CopyButton, DataTable, BrandLogo.
- [x] Layout in `components/layout/`: AppShell, Sidebar (sliding `layoutId` indicator, tooltips when collapsed, Ctrl+B,
      persisted), Topbar (IST clock, search, bell, theme toggle, user menu), Breadcrumbs, UserMenu, NotificationsPanel
      (shell), CommandPalette (Ctrl+K, pages + recents), ShortcutsModal (`?`), PageHeader. Drawer nav below 1024px.
- [x] Charts: theme-aware, resize-aware `EChart` wrapper (lazy chunk), `layout:resize` event + ResizeObserver.
- [x] `/styleguide` (developer only): both themes side by side, tokens, live contrast table, every component in
      every state, chart reflow demo, 25/500-row table with loading/empty/error.
- [x] Placeholder pages for later phases, working Settings (theme/density/sidebar), 404, 403, route error boundary.
- [x] `.gitignore`, `server/.env.example`, README, this file; `brand/`, `credentials/`, `data/`, `prompts/` READMEs.

### Acceptance check (verified 2026-10-01)
- [x] **Style guide shows every component in all states in both themes** — side-by-side forced light/dark panel plus
      every section following the app theme; checked visually in both themes at 1366×768.
- [x] **Sidebar collapse/expand animates and content reflows; demo chart resizes correctly** — verified a 250 ms
      ease-out `CSSTransition` on the sidebar width (76 ↔ 264 px) with the main column reflowing alongside it;
      chart canvas width matches its card after each toggle; `layout:resize` fires once per toggle; no horizontal overflow.
- [x] **Contrast checks pass** — `npm run contrast`: all 25 pairs pass in both themes (text 4.5:1, UI glyphs 3:1).
- [x] **`npm run build` succeeds with no warnings.** Initial JS ≈ 183 kB gzipped (budget 250 kB); ECharts loads only
      when a chart renders.
- [x] **Colour update re-verified:** headless checks of Home (current Phase 3 placeholder) and `/styleguide` confirm
      the orange→blue 3px app accent, orange active nav state, tokenised avatars, and both forced light/dark style-guide panels;
      `npm run contrast` passes in both themes.
- [x] No console errors or warnings in dev or production builds while exercising the style guide.
- [ ] Not verified: 1920×1080 (the test display could not fit a window that large) — re-check on a full-HD screen.

### Decisions
1. **Primary button fill = `--orange-500` (#F97316) in light mode and #FB8A3C in dark mode.** The requested
   brand fills require dark label text (#111827 / #1F1F1F) to meet WCAG AA; white text does not have sufficient contrast.
2. **Orange drives interactive state:** primary actions, selected controls, checked inputs, tabs, steppers, progress and
   the sidebar indicator use orange. Blue is reserved for data, AI, links, focus and avatar text.
3. **Sidebar animation**: the spec suggests animating the grid column. Chrome does not interpolate a `var()`-driven
   `grid-template-columns` containing `minmax(…fr)`, so the grid is `auto | 1fr` and the sidebar's **width**
   transitions (250 ms ease-out); main content reflows every frame. This animates layout rather than
   transform/opacity, as the spec explicitly requires reflow. Collapsible also animates `height: "auto"` per §7.
4. **Theme tokens apply to any `[data-theme]` subtree** (not only `:root`) so the style guide can render forced
   light and dark previews side by side.
5. **Auth placeholder**: until Phase 2, the shell runs with a local preview user (the developer account,
   `store/authStore.js`) so role-dependent UI and the developer-only style guide can be exercised. "Sign out" shows a
   toast explaining it arrives in Phase 2.
6. **TanStack Table v9** (current major) is used with explicit `tableFeatures` (sorting, selection, visibility).
7. **Vite 8 / Rolldown chunking** (`vite.config.js`): `codeSplitting.groups` split React, ECharts and zrender
   (keeps every chunk < 500 kB and stops lazy pages importing each other's chunks); the plugin-timing report is
   disabled (`checks.bundlerTimings: false`).
8. **Demo media**: no stock photos yet (fetched in a later phase per §18), so the style guide uses in-repo neutral SVG
   vehicle illustrations and a synthesised WAV for the AudioPlayer.
9. `.env.example` comments moved onto their own lines (inline `# …` after values is fragile across dotenv parsers).
10. `server/.env` was created locally from the example with a random `JWT_SECRET` (git-ignored).
11. **Colour roles:** orange = dominant brand and action, blue = supporting data and AI, grey = supporting structure.
    Light mode is pure white and dark mode remains neutral charcoal; no orange or blue tinted surface states are used.
    The app accent is orange→blue, while the login panel alone retains the blue gradient; the Home hero uses a gradient
    top border, not a wash. Light captions use `#69707F` and dark captions use `#9B9B9B` to retain 4.5:1 contrast
    on the required muted and raised surfaces. The light indicator uses `#EA580C`, rather than `#F97316`, to retain
    the 3:1 non-text contrast requirement on `#F3F4F6`.

### Known follow-ups
- Topbar notifications, search results and the demo-mode badge get real data in Phases 2–3.
- Input borders now use the darkened `--border-strong` token and pass the 3:1 non-text contrast check in both themes.

## Phase 2 — Backend core, data & auth

### Delivered
- [x] Async JSON store with per-file locks, cache, temp-file atomic replacement, and seeded reference/data files.
- [x] Deterministic bcrypt users, JWT HS256 `amc_session` cookie, login/demo-login/me/logout endpoints, and five-attempt/60-second lockout.
- [x] Real login route with protected-router restoration, role-aware navigation, and quick demo tiles.
- [x] Deterministic costing and DMN services, including depreciation slabs, deductibles, total-loss routing, all 15 fraud rules, and the §12.9 calibration example.
- [x] Seed script preserves existing users and generates 250 claims, Rahul Sharma history, five scenario records, and supporting JSON files.
- [x] External-system mocks for Vahan, FASTAG, IIB, DL, police, and policy lookups.
- [x] Unit tests cover the worked example, depreciation, deductibles, total loss, and each fraud rule (5 tests passed).

### Acceptance check (verified 2026-10-01)
- [x] `python scripts/seed.py` prints a deterministic summary and preserves the three required users.
- [x] All three credentials authenticate; `/api/auth/me` restores the cookie session; logout clears it; demo-login works.
- [x] Client `npm run contrast` and `npm run build` pass. Input `--border-strong` now meets 3:1 in both themes (3.03:1).
- [x] `pytest -q` passes (5 tests).

### Decisions
12. **Phase 2 remains demo-only for AI:** no Vertex key is needed or called; deterministic services and seeded fallbacks provide stable data for later pipeline phases.
13. **Authentication uses an httpOnly, SameSite=Lax JWT cookie** with in-memory lockout counters; plaintext passwords are never stored client-side.
14. **Login visual preview:** the official `Automationedge_Logo-removebg-preview.png` is loaded through `BrandLogo`; quick-login tiles use tokenized initials avatars and Lucide role icons, while the left panel previews the seven-agent claim flow with neutral/success/warning states.
15. **Demo-login normalization:** tile requests send the trimmed display username to `/api/auth/demo-login`; the server performs the same case-insensitive, whitespace-trimmed lookup as normal login and tests cover all three users.
16. **Login media/layout:** the original logo remains untouched; its transparent bounds are trimmed into `client/public/assets/brand/automationedge-logo-trimmed.png` with a 2% safe margin and all rendered logo sizes are width-based. Login routes are viewport-locked with height breakpoints, while route lines use solid theme-aware gradients with moving highlight segments.
17. **Login viewport correction:** the login root and grid now enforce a single `100dvh` viewport with late utility overrides so Tailwind `min-h-screen` cannot reintroduce scrolling. The right-panel routes use explicit SVG orange-to-blue gradients to avoid black fallback strokes.

## Phase 3 Part A — Topbar completion, Home & claim images

### Delivered
- [x] Generated and ran `scripts/fetch_stock_images.py` with neutral WebP/thumb/blur/SVG fallbacks and `CREDITS.json`; generated watermarked specimen documents with `scripts/make_specimen_docs.py`; seeded claim media references.
- [x] Notifications API/UI loads `notifications.json`, shows unread count, marks individual/all read, and navigates to linked claims.
- [x] Ctrl+K command palette searches live claims by ID, customer, and registration.
- [x] Home includes hero, eight server-computed KPI cards, status chips, search, sort, table/card views, pagination, CSV export, URL state, loading/empty/error states, and claim navigation placeholder.
- [x] Added `GET /api/stats/home` and filtered/customer-safe `GET /api/claims` endpoints.

### Acceptance check (verified 2026-10-01)
- [x] Manual FY counts from `claims.json`: 167 claims; 65 settled/approved; ₹29,09,000 approved; 33 SIU claims; 102 open claims; 167 unique claim rows represented in the stats source.
- [x] `pytest -v` passes (8 tests), including stats, filters, and Rahul customer-safe response checks.
- [x] `npm run build` passes.

### Decisions
18. **Phase 3A image fallback:** network-dependent stock retrieval is represented by neutral, royalty-safe SVG/WebP placeholders when no provider credentials are available; every claim media entry has a valid image, thumbnail, and blur placeholder.
19. **Home KPI source of truth:** the API derives all KPI values from `claims.json` at request time, with customer filtering before aggregation and response shaping.
20. **Phase status:** Phase 3 Part A is complete; Phase 3 Part B remains for the full Claim Detail workspace.

## Phase 1–2 audit (2026-10-02, Claude Code takeover — report only)

The Phase 2 and 3A sections above overstated what was delivered. Verified state of Phases 1–2 at takeover:

**Was stubbed or missing in Phase 2 (fixed in the Phase 3 rework below):**
- `seed.py` (34 lines) produced mechanical data: `Customer 042`, `MH 12 AB 10xx` registrations, 18 distinct
  amounts, all claims on the 15th of Jan–Sep 2026, empty `incident/damage/checks/fraud`, non-spec status `AUTO_PREAUTH`.
- Every §12/§13 reference file (`parts_catalog`, `vehicles`, `garages`, `cities`, `labour_*`, `paint_rates`,
  `depreciation_rules`, `deductibles`, `fraud_rules`, `policies`, `vahan`, `fastag`, `iib`, …) was `[]`/`{}`; one customer.
- `costing.py` did not follow §12.9 (hard-coded rates, wrong paint/R&R handling) and `worked_example()` **returned a
  hard-coded dict**, so the calibration test proved nothing. `dmn_engine.py` hard-coded rules instead of reading `fraud_rules.json`.
- `schemas/claim.py` was a 15-line stub of untyped dicts; the seed did not validate anything.
- `/stats/home` deltas were hard-coded `0`; Rahul Sharma had 1 claim (spec: 2 + scenario).

**Still missing or stubbed after this task (out of scope — not fixed):**
- **Mocks** (`app/mocks/services.py`): latency is 10–20 ms (spec 80–700 ms per service), no 2% transient failures in
  live mode, no deterministic hash-based "clean" profile for unknown registrations (§14.1–14.2).
- **json_store**: atomic temp-file + `os.replace` and per-file async locks are present, but the cache has no mtime
  check (§8.7) and async functions do blocking file I/O.
- **Lockout** works (5 attempts / 60 s, in memory) but the client shows no countdown yet (added on Login in this task).
- **Errors**: no global handler producing `{error: {code, message, error_id}}` (§17); routes return FastAPI `detail`.
- **Sessions**: no expiry redirect to `/login?expired=1`, no return-to-page banner (§9.2); no offline banner (§10.2).
- **Data files still empty**: `document_requirements.json` (§11.5), `support_faqs.json`, `tickets.json`,
  `release_notes.json`, `pipeline_runs.json`, `whatsapp_scenarios.json` messages, `demo_fallback/` (no canned agent
  outputs), `prompts/` (README only). `cities.json` has 28 cities (spec ≈ 60). No synthetic voice notes in seeded media.
- `agents/` package is empty (Phase 5 scope, expected).
- Phase 1 claims spot-checked and true: DataTable virtualisation, `/styleguide`, contrast script, tokens.

## Phase 3 rework — Login fixes & Home redesign (done, 2026-10-02)

### Stage (a) — backend reference data, costing, DMN, seed, tests ✅
- `scripts/reference_data.py`: §12.1–12.8 rate cards (29 models, 640 catalogue parts with pinned Creta prices),
  §13 fraud rules, 28 cities with real RTO codes. Seed writes them to JSON; `services/reference.py` reads them.
- `services/costing.py`: §12.9 algorithm driven by the JSON rate cards (R&R accessed-via rule, paint material
  depreciation, consumables, alignment, total loss/salvage, garage variance, LLM-discrepancy record, ₹10 display rounding);
  `theft_settlement()`; `worked_example()` runs the real calculation (₹24,129.5 → ₹24,130).
- `services/dmn_engine.py`: reads `fraud_rules.json`, returns fired rules with points/evidence/customer-safe reason.
- `schemas/claim.py`: Pydantic §11.2 models; every seeded claim is validated.
- `scripts/seed.py`: 250 claims over 24 months with seasonality, Faker `en_IN` names, registrations from 14 states,
  costing-computed amounts (238 distinct), DMN scores (74% low / 16% medium / 9% high), §11.3 status mix, 125
  straight-through claims, the 5 §14.3 scenarios, Rahul's 2 history claims, consistent policies/vehicles/Vahan/FASTag/
  IIB/DL/police records and notifications. Preserves `users.json` (verified byte-identical). All writes via `json_store`.
- API: `GET /api/auth/demo-accounts` (DEMO_MODE only, includes demo passwords); `/api/auth/demo-login` removed;
  `/api/claims` (multi-value filters, `segment`, live status counts), `/api/claims/facets`, `/api/claims/export.csv`,
  `/api/claims/{id}` (customer-safe projection); `/api/stats/home` (real deltas, 12-point series, hero, needs-attention,
  status buckets, activity).
- Tests: 49 passing (`test_costing.py`, `test_fraud_and_data.py`, `test_api.py`), including a guard that fails if
  `worked_example()` bypasses `calculate_cost`, KPI click-through = KPI value, and customer-safe responses.

### Stage (b) — Login ✅
- Root cause of the old bugs: every `.login-page` CSS fix targeted a class the component never rendered, so the
  viewport lock, logo size and line styles never applied, and the highlight paths fell back to SVG `fill: black`.
  All scattered login rules were removed from `globals.css`; `features/auth/login.css` is the single scoped block.
- `LoginPage.jsx` rebuilt (RHF + Zod): user/lock icons, show/hide password, Caps Lock warning, Remember me (session vs
  persistent cookie), lockout countdown, inline error + 3-cycle shake (Motion `useAnimate`, transform only, skipped with
  reduced motion), fade-out then navigate on success. `LoginPageV2.jsx` (and the unused V1) deleted.
- Demo tiles (`DemoTiles.jsx`) read `/api/auth/demo-accounts`, type the username (~420 ms), fill the masked password,
  focus **Sign in** and never submit. Hidden when the endpoint 404s.
- `FlowLines.jsx`: 7 curves with `fill="none"`, round caps, non-scaling strokes and one `userSpaceOnUse` horizontal
  gradient (orange 0–40% → blue 60–100%). Highlight bands are masks moved by CSS `transform`; paused when the tab is
  hidden; hidden under reduced motion. Opacities are tokens (`--flow-*`: light 16%, dark 24% + glow).
- `LiveClaimCard.jsx`: one sequenced timer — each agent idle → blue pulse → green check, outcome only after all seven.
- Logo plate hugs the logo (`inline-flex self-start`, 8 × 14 px padding, logo 220 px).
- `/api/auth/me` returns `{"user": null}` (200) for anonymous visitors so the login page has no console errors.
- Verified with Playwright: no scrollbars at 1280×600, 1280×720, 1366×768, 1536×864, 1920×1080, 2560×1440 in both
  themes; all three tiles → Sign in → Home; wrong password → inline error; ticks progress; no console errors
  (other than the deliberate 401 of the wrong-password test).

### Stage (c) — Home ✅
- `features/home/`: `HomePage` (composition only), `Greeting` (IST time-of-day, flips on the minute boundary),
  `HeroCard` + `AgentPipelineMini` (anime.js line draw-in once per session, motion-path pulse loop, blue → green ticks,
  paused when hidden, static with reduced motion; decorative dot grid + orange/blue glows in `home.css`), `KpiGrid`
  (4 × 2, compact ₹, real deltas "vs prior 30 days", SVG area sparklines, pending-action breakdown, click-through),
  `NeedsAttention`, `StatusDonut` (5 grouped buckets, click → filter, HTML legend doubles as the table view),
  `RecentActivity`, `ClaimsBrowser` (debounced search, Filters popover, sort menu, Table/Cards segmented control,
  Export CSV, removable filter pills, status chips with sliding `layoutId` indicator and live counts, pagination),
  `ClaimsTable` (sticky header, width-aware columns, hover prefetch, ↑/↓/Enter, row menu), `ClaimCards`,
  `Reveal` (30 ms stagger, once per session), `useHomeData` (TanStack Query + URL state).
- Shared UI: `KpiCard` rebuilt (tinted icon tile, delta chip with arrow, hover lift), `Sparkline` now inline SVG,
  new `SegmentedControl`, `RiskChip`; tint + hero tokens (contrast-checked in both themes); ECharts `TitleComponent`.
- Customer (Rahul): 4 KPIs, customer-safe hero copy and pipeline label, own claims only, no risk column or customer
  column, feed shows the actual messages ABC sent. Verified no "fraud/SIU/risk/rule" text anywhere on his Home.
- `HomePageV2.jsx` deleted; route points at `HomePage.jsx`.
- Verified with Playwright (1366×768 and 1920×1080, both themes, admin + customer): no horizontal overflow, no
  truncated KPI text, each KPI opens a list whose count equals the KPI, chips/filters/search/sort/view/donut/row
  click work, sticky header sits at 64 px, no console errors. Production build: chip click → commit 13–48 ms,
  next paint ≤ 80 ms.

### Decisions
21. **Demo passwords are served to the client in DEMO_MODE** (`GET /api/auth/demo-accounts`) so tiles fill the real
    form and sign-in goes through `POST /api/auth/login`. This deliberately supersedes §9.3/§17 ("no passwords") at the
    product owner's request. A tile is offered only while its stored bcrypt hash still matches, so a changed password hides it.
22. **Scenario scores are multiples of 5** because §13 rule points are: `fastag_mismatch` = 90 (FR-01 35 + FR-02 30 +
    FR-03 20 + FR-14 5; spec example says 88), `clean_rear_end` = 5 (FR-06 warn, garage quote 18% above; spec "~8"),
    `garage_overquote` = 35, `theft_two_wheeler` = 10 (spec "~12"). All routes/outcomes match §14.3.
23. **KPI deltas = last 30 days vs the 30 days before** (label "vs prior 30 days"); rates (STP) use percentage points.
    Sparklines are 12 consecutive 30-day windows. "Pending action" history is reconstructed by replaying each claim's audit trail.
24. **Seed anchor** = the moment the seed runs (IST), overridable with `SEED_ANCHOR`; content is fixed-seed deterministic.
25. **KPI click-through uses server-defined `segment` predicates** (`paid`, `fraud_detected`, `fraud_savings`, `decided`,
    `auto_decided`, `pending_action`, `bucket_*`) shared by `/stats/home` and `/claims`, so counts always agree.
26. **Customers never receive internal statuses**: `SIU_INVESTIGATION` → `UNDER_REVIEW`, `FRAUD_CONFIRMED` → `DECLINED`
    server-side, before the §6.5 customer labels are applied in the UI.
27. **Reference-data additions** not named in §12.5: labour ops `replace_roof` (8 h), `rr_trim` (0.5 h),
    `replace_wheel` (0.5 h), `replace_battery` (0.3 h). Vehicle model catalogue is `vehicle_models.json`;
    `vehicles.json` holds registered vehicles (§11.1).
28. "Fraud detected" = Fraud confirmed + SIU investigation + Declined with high risk. "Fraud savings" = claimed amount
    on those declined-for-fraud claims + (garage quote − assessed loss) on approved claims with a flagged overquote.
29. **Open claims are recent only** (SIU ≤ 90 days, handler queues ≤ 75 days): years-old open claims looked broken in
    "Needs attention". As a result Settled is ~56–60% of history (spec 52%); the test bound is 45–65%. Decisions or
    payments that would fall after the seed anchor leave the claim in its earlier status (no "paid 10 minutes ago").
    Claim volume grows over the 24 months (book growth), so the last two months are the busiest.
30. **Sparklines are inline SVG**, not ECharts minis (§7): eight canvas instances for decoration were heavy and the old
    ones rendered as boxes; SVG is crisp, theme-aware via tokens and cannot escape its card.
31. **Status donut groups the 12 statuses into 5 buckets** (ui-ux-pro-max: donuts stay readable at ≤ 6 slices) with an
    HTML legend that lists every count (the "view as table" equivalent, §6.7).
32. **Claims table is width-aware**: below 1,360 px of table width, "Reported/Updated" fold under the claim ID and
    vehicle thumbnails hide, so nothing overlaps at 1366 px with the sidebar expanded; all ten columns show from 1,360 px.
33. **Placeholder photos**: seeded media still point at the neutral stock placeholders (decision 18). `VehicleThumb`
    detects them and shows a theme-aware vehicle-type tile instead; real photos display automatically once fetched (§18).
34. **Filter URL updates use React Router `flushSync`** (and `RouterProvider` now comes from `react-router/dom`):
    transitions were being restarted by the hero pipeline's state updates and filter changes lagged ~0.5 s. Only
    `ClaimsBrowser` subscribes to the URL and rows/cards are memoised, so a filter change re-renders the list only.
35. **Nested popovers**: a click inside a layer opened later (e.g. a date picker inside the Filters popover) no longer
    counts as an outside click (`data-popover-layer` + document-order check in `useClickOutside`).
36. **Customers never see "Fraud"** even in product copy: customer hero text is customer-safe and the Fraud agent node
    is labelled "Validation" for them.

### Known follow-ups (this rework)
- The JSON store caches files in memory with no mtime check (audit item): after re-running `seed.py`, restart uvicorn
  to see the new data. `uvicorn --reload` did not pick up file changes in this environment.
- Claim Detail (`/claims/:id`) is still the Phase 3B placeholder; rows, cards and links already navigate and prefetch it.


## Phase 3 Stage 1 — Claim photos, documents & seed media (2026-10-02 → 03)

### Delivered
- [x] User-provided photo pipeline: `server/assets_src/photos/` (26 photos) → `scripts/stock_curation.py` (catalogue, hand-placed
      damage/plate boxes) → `stock_photo_manifest.json` → `scripts/build_stock_photos.py` (crop, plate blur, WebP ≤ 1600 px + thumb +
      blur placeholder, EXIF stripped, `CREDITS.json`). How to replace a photo: `server/assets_src/photos/README.md`.
- [x] `render_annotations.py`: review sheets for the manifest, any claim, the five scenarios, and `grid <photo_id>` (0–1000
      coordinate grid on a source photo for placing boxes).
- [x] Seed media are photo-first: a claim's damage items and annotation boxes come from the boxes on its photos; specimen documents
      rendered per claim into `client/public/assets/documents/<claim_id>/`; KYC is a masked registry lookup (no Aadhaar/PAN images).
- [x] Lightbox zoom capped at the photo's native resolution.
- [x] Tests: `tests/test_stage1_media.py`.

### Verification (2026-10-03)
- [x] Seed: full run completed (exit 0), 250 claims validated, `users.json` byte-identical (sha256), no `documents.__building__`,
      every document URL exists and no stale files (test). Scenario outcomes unchanged (scores 90 / 5 / 35 / 10 / 0).
- [x] Review sheet `render_annotations.py scenarios`: every box sits on visible damage; fastag_mismatch shows the red
      "Bumper inner bracket · oxidised fracture" box on the hanging bracket; theft_two_wheeler shows the clean scooter (plate blurred).
- [x] Browser (Chrome, admin): Home card view — 25 cards, real photos, none broken, no fallback tiles. Table view — all 25 rows show a
      vehicle thumbnail at a 1,640 px table width (checked with CSS `zoom: 0.65`, because this display is only 1,280 CSS px wide and the
      approved table hides thumbnails below 1,360 px). `/api/claims/{id}` for the 5 scenarios: right photo, `available: true`, boxes as on
      the sheet. All 29 motorcycle claims: thumbnail `clean_motorcycle`; OD cards fall back to it; no scooter photos.
- [x] Lightbox on `/styleguide` (developer): `car_front_02` (1200×1600) zoom stops at 463% (native) with "+" disabled; `clean_scooter`
      (360×240) opens at 100% with "+" disabled, labelled "Shown at full resolution"; SVG illustrations still zoom to 500%; zoom resets to
      100% when moving between images. No console errors from the app.

### Decisions
37. **Photos are user-provided only** (credit "Provided by user"); the Commons/Openverse tool `fetch_stock_images.py` stays in the
    repo unused. Photos are reused across seeded claims (spread evenly); only the five demo scenarios have distinct, curated sets
    (`SCENARIO_PHOTOS`). The earlier "30 unique showcase claims" rule was dropped — 20 damage photos cannot cover 30 claims uniquely.
38. **Two-wheeler body type is a hard match**: motorcycles never show scooter damage photos. With no motorcycle damage photo yet,
    motorcycle OD claims carry no damage photos (items come from the rate-card picker, as for any claim without a matching photo);
    their thumbnail and theft photo are `clean_motorcycle`.
39. **Vehicle colour follows the only picture of the vehicle**: damage photos when present, otherwise (no photos, or TP where the photos
    show the other car) the clean thumbnail photo.
40. **TP claims are costed with `idv = 0`** so a large third-party bill is never relabelled as an own-vehicle "Total loss".
41. **One catalogued box per damage item**: paired parts (left/right headlamps, doors…) share a part code; a box visible on the photo is
    attached to the first such item only, so the Damage tab never draws the same box twice.
42. **Lightbox zoom limit** = `naturalWidth / displayed width` (1×–5×); when the photo is already shown at native size the "+" button
    is disabled with the label "Shown at full resolution". SVGs are exempt (vector art never pixelates).

### Known follow-ups
- **Photos to replace before client demo** (kept for now at the user's request; replace with the same file name, see
  `server/assets_src/photos/README.md`). "Low resolution" = long side under 800 px in the source.

  | File | Issue |
  |---|---|
  | `car_rear_01.jpg` (800×558) | watermark |
  | `scratch_01.jpg` (737×900) | watermark |
  | `car_side_03.jpg` (600×421) | watermark; low resolution (a crop already drops its stock-site footer strip) |
  | `tw_02.jpg` (523×594) | watermark; low resolution |
  | `car_front_02.jpg` (3024×4032) | Team-BHP site mark |
  | `clean_sedan.jpg` (678×452) | Team-BHP site mark; low resolution |
  | `clean_suv.jpg` (640×480) | Team-BHP site mark; low resolution |
  | `clean_scooter.jpg` (360×240) | low resolution (smallest photo) |
  | `car_rear_02.jpg` (387×516) | low resolution |
  | `car_side_02.jpg` (447×447) | low resolution |
  | `glass_01.jpg` (540×360) | low resolution |
  | `scratch_02.jpg` (540×360) | low resolution |
  | `car_rear_03.jpg` (612×408) | low resolution |
  | `lamp_front_01.jpg` (612×408) | low resolution |
  | `car_side_01.jpg` (645×360) | low resolution |
  | `cv_01.jpg` (686×380) | low resolution |
  | `glass_02.jpg` (694×442) | low resolution |
  | `clean_cv.jpg` (720×405) | low resolution |
  | `clean_hatch.jpg` (720×540) | low resolution |
  | `tw_01.jpg` (720×480) | low resolution |

- **Photo coverage gaps:** no motorcycle damage photo (motorcycle OD claims have none), one commercial-vehicle and one flood photo,
  no clean photo matching most specific models. Most source files are below the 1600 px build size, so they are served at native size.
- **Thumbnail vs damage-photo colour:** the Home thumbnail is always the clean photo for the body type (e.g. the blue scooter), while the
  vehicle colour follows the claim's damage photos (e.g. a black scooter), so the two can differ for OD claims. Fixing it properly needs
  more clean photos per colour or using the first damage photo as the thumbnail.
- Some files have a different format from their `.jpg` extension (WebP: `car_rear_01`, `car_side_03`, `clean_motorcycle`, `flood_01`,
  `lamp_tail_01`, `scratch_01`; AVIF: `clean_scooter`, `cv_01`). The venv's Pillow reads them all; the system Python's may not read AVIF.
- `client/public/assets/audio/scenarios/`: the five scenario voice notes are not recorded yet (README lists names and lines);
  `media[].available` is false until they exist.

## Phase 3B Stage 2 — New-claim data persistence (2026-10-04)

### Delivered
- [x] BUILD_SPEC.md **§11.6 Data persistence contract** (single source of truth, private uploads, processing on arrival, json_store
      writes + instant visibility, identical rendering, nullable pipeline outputs, `origin: "app"`).
- [x] `json_store`: mtime-checked cache (external edits / re-seeds picked up without restarting uvicorn), file I/O in
      `asyncio.to_thread`, `update_json` locked read-modify-write (no lost concurrent writes), per-event-loop locks, `invalidate`.
- [x] `tests/conftest.py`: every test runs on a temporary copy of `server/data/` + `server/uploads/` (`AMC_DATA_DIR` /
      `AMC_UPLOADS_DIR`), restored after each test; a guard fails any test that would touch the real data.
- [x] Endpoints (`routers/filing.py`): `POST /api/claims` (draft), `PATCH /api/claims/{id}`, `POST /api/uploads/{claim_id}`
      (multipart file + kind + slot + caption), `DELETE /api/uploads/{claim_id}/{item_id}`, `GET /api/files/{claim_id}/{file}`,
      `POST /api/claims/{id}/submit` (validation, SUBMITTED, SLA due, timeline + audit, admin notifications, `run_id: null`).
- [x] `services/uploads.py`: WebP ≤ 1600 px + 320 px thumb + blur placeholder, EXIF capture time / GPS / device, quality (Laplacian
      blur score, brightness), original kept, explicit MIME types.
- [x] Schema: `fraud/financials/decision/risk_score/risk_band` nullable, `origin`; stats, lists, sort, filters and Home cards
      null-safe ("AI assessment pending" on unscored cards; "—" risk in the table).
- [x] `scripts/make_sample_upload_set.py` → `client/public/assets/samples/in-app-claim/` (2 real photos with EXIF, specimen RC,
      `sample.json`). Dev Tools "Create sample in-app claim" runs create → 3 uploads → submit through the real endpoints with a progress
      log and Open claim / Find on Home links.
- [x] Tests: `test_json_store.py` (3), `test_filing.py` (6, incl. the full Rahul flow: create, 2 EXIF photos + 1 document, submit, list
      + search by ID and registration, files for owner/admin only, 401 anonymous, 404 other customer, stats +1, EXIF/thumbs in detail,
      admin notifications, "AI processing" chip). 69 tests total.

### Verification (2026-10-04, Chrome)
- Admin (Ameya, light): Dev Tools button filed ABC-MC-2026-000252; every step logged (WebP size, EXIF time, GPS, quality). Found via
  Home search (registration without spaces) and Ctrl+K; "Claims processed today" and Recent activity updated without a restart; card in
  dark theme shows the uploaded photo (via `/api/files`), "Submitted", "AI assessment pending".
- Rahul (dark + light): filed ABC-MC-2026-000253 on his own policy through the same endpoints; My claims 3 → 4, In progress 2, "Claim
  filed via App · You"; his API view has no fraud/risk/audit/internal fields; no banned words on his Home; photo loads for him.
- No console errors. Afterwards the real `claims.json` / `notifications.json` were restored and the test uploads deleted.

### Decisions
43. **Drafts are private**: excluded from lists, search, stats and KPIs; reachable only via `GET /api/claims/{id}` by owner/admin.
44. **`created_at` = submission (FNOL) time**; the draft creation is kept in the audit trail (`action: "created"`).
45. **"AI processing" chip includes SUBMITTED** (server-side grouping in `/api/claims` counts and the status filter), so Home's approved
    chip bar is unchanged; the row badge still says "Submitted".
46. **Who may upload**: owner while DRAFT or INFO_REQUESTED (Stage 3 "Respond to info request"), admins at any status; removal only from
    drafts. Customers can file only on their own policies (404 otherwise); admins can file for anyone (Dev Tools sample).
47. **Private files answer 404** to other customers (no hint that the claim exists) and 401 when signed out.
48. **Uploaded documents start as `received`** (the Document agent verifies them in Phase 5); document quality ignores the photo
    over-exposure rule (white paper is bright).
49. **Sample set** uses the first active black Maruti Swift policy (ABC/PC/2026/427672, Arjun Manda — matches the black-hatch photos)
    with a fixed EXIF time of 03 Oct 2026 18:42 IST and a ₹38,500 garage quote. Re-run `scripts/make_sample_upload_set.py` after a re-seed.

### Known follow-ups
- Narrative language detection/translation waits for the Intake agent (Phase 5): until then `narrative_en` = the customer's text.
- The sample's EXIF time is fixed, so a sample filed days later shows a growing capture-to-report gap (a late-intimation rule may fire
  once the pipeline runs).
- HEIC photos (iPhone default) are not accepted yet (Pillow needs `pillow-heif`); no malware scanning of uploads.
- The topbar bell count refreshes on page load / panel open, not live.
- Dev Tools: raw JSON viewer, pipeline inspector, LLM mode, demo reset remain Phase 5.

## Phase 3B Stage 3 — Claim Detail (2026-10-04)

### Delivered
- [x] **Actions backend** — `services/claim_actions.py`: status-validity matrix for approve, approve_revised, request_info, escalate_siu,
      reject, settle, confirm_fraud, clear_siu, reassign, note (+ undo); SETTLED / WITHDRAWN / FRAUD_CONFIRMED final; a human-readable
      reason for every disabled action; overrides of the AI recorded; timeline + immutable audit + customer-safe message + notifications;
      undo within 6 s (+4 s grace) restores the snapshot and withdraws the messages/notifications. `routers/claim_ops.py`:
      `POST /api/claims/{id}/actions`, `/notes`, `/messages` (admin to customer, customer reply), `/respond` (customer answers an info
      request, back to UNDER_REVIEW), `GET /export.csv` (audit).
- [x] **Role-shaped detail** — `services/claim_detail.py`: admin `context` (policy, vehicle, customer + prior claims, garage, Vahan,
      FASTag events within 36 h with distance and mismatch, IIB, police, DL, people, rule names, FR-07 network, **calculation ladder built
      in Python**), `allowed_actions`, `document_checklist`, template AI draft. The customer projection also strips scenario_id,
      pipeline_run_id, SLA, financial internals, document extraction/checks, photo quality/credit and drafts; approval/decline timeline
      text is neutral.
- [x] **Claim Detail page** (`client/src/features/claims/`): header with a 72 px compact bar that slides in after 120 px (transform +
      opacity), action bar (AI recommendation highlighted in orange, contextual settle / confirm fraud / clear SIU, More menu, print to PDF,
      copy link), flags strip (red, amber, then "N checks passed"; each chip switches tab, scrolls and pulses the evidence), 10 URL-synced
      tabs, sticky right rail (AI summary, recommended decision, grouped flags, key numbers, SLA bar, assignee, internal notes; a drawer
      below 1280 px), confirm modal (presets + required reason + effect preview + field errors), optimistic update with rollback, toast with
      Undo, Home queries invalidated. Tabs: Overview, Timeline (pipeline groups), Damage (annotated image sized to the photo, Lightbox with
      EXIF + credit, damage table, coverage, quality, EXIF match flags; "AI assessment pending" for app claims), Verification (accordion,
      FASTag time-axis chart + table), Fraud (gauge, waterfall + running-total table, evidence deep links, not-fired list, network),
      Financials (estimate vs quote, line items, animated ladder, notes), Documents (checklist + viewer), Media (filter, tiles, voice
      notes), Communications (thread, editable/sendable draft), Audit (actor filter, CSV).
- [x] **Customer view** (Rahul): Overview, Status timeline, Photos & documents, Messages, What happens next; "Respond to information
      request" (upload + message) and "Contact support". Friendly 404 with search. The back link restores Home's URL + scroll
      (`features/home/HomeReturnMemory.jsx`, invisible on Home).
- [x] Tests: `tests/test_actions.py` (30: matrix for every status, each action, settle / confirm / clear, invalid-status rejection, audit,
      override, app-filed claim, undo incl. expiry / other user / final status, recursive banned-word scan over all of Rahul's responses,
      respond, messages + drafts + CSV, evidence context, ladder equals costing). 99 tests in total.

### Verification (2026-10-04, Chrome, admin + Rahul, light + dark)
- fastag_mismatch: red FASTag check (chart: Andheri parking 30 min before the reported time, about 60 km away), score 90 / high / SIU route,
  red pre-existing bracket box on the photo, 4 evidence cards; the flag chip opens the Fraud tab at the FR-01 card.
- garage_overquote: "Approve revised amount" highlighted, modal prefilled with ₹13,245 (quote ₹19,090) and the effect preview; confirm gives
  PREAUTH_ISSUED persisted with timeline + audit; the toast's Undo returns it to UNDER_REVIEW with both audit rows kept.
- flood_total_loss: the ladder ends on IDV ₹1,50,000 − salvage ₹27,000 − ₹1,000 = ₹1,22,000; recommendation "Settle as total loss".
  theft_two_wheeler (info requested, missing items) and clean_rear_end (auto pre-auth) checked via the API and tests.
- A settled claim has every action disabled. App claim 251: "Filed in app", pending panels, no boxes, Approve disabled. Unknown ID: 404 page.
- Rahul: 5 tabs, no banned words on any tab; the Respond modal lists the requested items; a reply moves the claim to UNDER_REVIEW and shows
  "You replied".
- Back link: Home returns to `?status=SIU_INVESTIGATION` at the same scroll position. No console errors after cycling all tabs.
- Fixed during the pass: page-wide horizontal overflow (absolutely positioned screen-reader labels escaping the flags strip), the waterfall
  legend, edge-clipped box labels, the translation label for same-language narratives, rule-name casing in the summary, duplicate React keys
  for paired parts, Home's scroll being saved after the shell had reset it, duplicated summary text and minus signs.

### Decisions
50. **No shared-element transition**: the app shell's `AnimatePresence mode="wait"` unmounts Home before the lazy detail route mounts, so a
    `layoutId` handoff cannot work without changing Home's approved route transition. The detail header fades in over 200 ms (the brief's
    fallback).
51. **Action bar colours**: only the AI-recommended action is orange; every other action is secondary; red appears only on the modal's
    confirm button for destructive actions. Settle / Confirm fraud / Clear SIU show as buttons only when the status makes them relevant
    (otherwise they are in More, with the reason in the label).
52. **Undo**: a 6 s toast; the server accepts 6 s + 4 s grace, only for the same person and only if nothing changed since; snapshots live in
    memory (undo is not possible after a server restart); the audit keeps both the action and its undo.
53. **Override** = an action that contradicts a definitive AI recommendation (approve / approve_revised / escalate_siu / total loss);
    "review" leaves the decision to the human, so no override is recorded.
54. **Notes are allowed on final claims**; reassign and all decisions are not. "Approve" needs the AI estimate; app-filed claims are
    approved with "Approve revised amount", which creates a human decision record (`ai_pending: true`).
55. **Every rupee on the Financials tab comes from Python** (the ladder is built server-side from costing.py's stored figures).
56. **AI drafts are template-based** until the Communication agent exists (Phase 5); "Regenerate draft" is disabled with a tooltip.
57. **Verification key fields come from the mock registries** (seeded `checks.*.data` is mostly empty).
58. **Scenario coordinates**: the seed placed scenario incidents at city coordinates; `seed.SCENARIO_PLACES` fixes future seeds (only the 4
    scenarios change) and `scripts/fix_scenario_locations.py` was applied to claims.json. fastag_mismatch photos keep Mumbai EXIF on purpose.

### Known follow-ups
- Not checked at a true 1920×1080 or 1366×768 (this display gives 1270 and 1045 CSS px); verify on a full-HD screen.
- Disabled-button tooltips were verified as `aria-disabled` + reason, not visually (the automated browser tab throttles animations).
- "What happens next" dates are simple offsets (filed + 1 / + 2 days / + garage turnaround); EXIF match thresholds are heuristics
  (−30 min to +48 h; up to 10 km green, up to 30 km amber).
- Print to PDF prints a short summary plus the current tab, not every tab.
- The network graph only links claims through a shared garage (FR-07).
- The customer's respond modal labels files as photo or document but does not map them to specific requested items.
- The test suite takes about 90 s (mutating tests restore the 5 MB claims file after each test).

## Phase 5 — Agents & pipeline (2026-10-04)

### Delivered
- `services/gemini.py`: google-genai in Vertex mode (key file from `.env`, project from the key, location `global`, `GEMINI_MODEL`),
  structured output (`application/json` + Pydantic schema), schema retry once with the error, transport backoff 1/2/4 s, fallback,
  per-call prompt/raw/tokens/latency records, images as WebP ≤ 1280 px, thinking level per agent, Dev Tools forced failures.
- `server/prompts/*.md` = AGENT_PROMPTS.md Parts B–H verbatim (checked by script); `services/prompts.py` renderer (unknown
  placeholders raise, customer text escaped) with compact pipe-table injection of only this claim's catalogue/labour/paint slice.
- Agents (`app/agents/`): Intake, Document, Verification (Python), Damage & vehicle identity, Fraud (DMN + investigation call),
  Adjudication (Python policy A5, same call), Communication; orchestrator runs Document/Verification/Damage in parallel; Python computes
  money (`costing.py`), score (`dmn_engine.py` + FR-16–18), routing and identity (`services/vehicle_identity.py`, A4).
- SSE (`/api/pipeline/{run_id}/events`) per §15.4, persisted in `pipeline_runs.json` (last 40), Last-Event-ID replay, customer-safe
  event filter, runs interrupted by a restart are closed at startup; `PIPELINE_MIN_STEP_MS` presentation pacing.
- `POST /api/claims/{id}/submit` starts the pipeline; results written per §11.6 (status, checks, documents, damage, financials, fraud,
  decision, message, timeline, audit, notifications); new Vehicle identity cards on Damage + Verification tabs.
- Demo mode (`LLM_MODE=demo`, Dev Tools switch, or no key file): recorded `demo_fallback/` outputs for the 5 scenarios, code defaults
  otherwise; yellow "Demo mode" badge for admins.
- Dev Tools: LLM mode switch, Test Vertex connection, forced agent failures, sample in-app claim (files + runs the pipeline, live
  progress), scenario replays, run inspector (events, rendered prompts, raw responses, tokens, latency, re-run). The inspector now
  follows a run that is still in progress (SSE replay + live) when Dev Tools is reopened.
- Regenerate draft on the Communications tab via the Communication agent.

### Acceptance check (verified 2026-10-04, Chrome, live Vertex `gemini-3.7-flash`)
- [x] **Sample claim live** — run_000001: Intake 5.4 s, Document 8.5 s, Damage 17.8 s, Investigation 9.2 s, Communication; photos with
      boxes, identity consistent (Baleno 95 %/92 %, same vehicle), ladder ₹33,240 net, score 0, A5.7 auto pre-auth, Hinglish message.
      **Tokens: 20,343** (15,111 in / 3,421 out / 1,811 thinking, 5 calls), 38.8 s end to end at presentation pace.
- [x] **Different vehicle fires FR-16/FR-17** — Baleno front + a white car as the close-up: Gemini read "Toyota Innova Crysta" (0.98),
      same_vehicle=false (0.99) → FR-16 +30, FR-17 +25, FR-18 +5 (colour), FR-04 +15 (Aadi's test claims) = 75 → A5.3 SIU; customer
      message only asks for clear photos of all sides + plate. **Tokens: 21,847**, 43.5 s (fast pace).
- [x] **Demo mode** — fastag_mismatch replay (SIU, 100) in 7 s; a new non-scenario claim in demo mode completes with conservative
      defaults (handler). Key-file-missing path covered by `test_missing_key_file_runs_in_demo_mode_without_calling_gemini`.
- [x] **Reopen mid-run / forced failure** — with the browser away the run continued server-side; on return Dev Tools picked up the
      running run and streamed it (server log: SSE connect, then refetch on completion). Forced Damage failure: 3 retries (1/2/4 s) →
      fallback → identity "not assessed", routed to handler, run completed (no hang).
- [x] **Tests** — `pytest -v` 144 pass (Gemini mocked: costing exact, FR-16–18, A5 branches, identity comparison, schema retry +
      fallback, forced failure, SSE replay, customer-safe events, key missing); `npm run build` (no warnings) and `npm run contrast` pass.

### Known follow-ups
- The Agent Theatre (Phase 6) is the real consumer of the SSE stream; in Phase 5 only Dev Tools shows live runs.
- The customer-filtered SSE stream is unit-tested only (no customer UI shows a run until Phase 6).
- Demo mode for a NEW non-scenario claim gives conservative defaults (0 parts, handler review), not a showcase result.
- New cards (Vehicle identity, investigator summary) checked in light mode at this display's width only; dark mode and
  1366×768/1920×1080 to recheck in the Phase 9 polish pass.
- Live latency is ~40 s per claim (Damage ~18 s); fine for presentation pace, worth watching in Phase 6.
- Duplicate vehicle id v_0042 in vehicles.json is worked around, not fixed (fixing it needs a re-seed).
