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
- Input borders (`--border-strong`, 1.47:1 on white) are below 3:1; inputs are identified by labels and focus ring.
  Revisit in the Phase 8 accessibility pass if a stricter reading of WCAG 1.4.11 is wanted.
