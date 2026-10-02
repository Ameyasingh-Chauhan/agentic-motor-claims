# Build progress

Phases and acceptance criteria are defined in `BUILD_SPEC.md` §19.

| Phase | Status |
|---|---|
| 1 — Foundation & design system | ✅ Done (2026-10-01) |
| 2 — Backend core, data & auth | ⏳ Next |
| 3 — Home & Claim Detail | — |
| 4 — Dashboard | — |
| 5 — Agents & pipeline | — |
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
