# AGENTS.md — Agentic Motor Claims

Standing rules for every coding agent on this project. Codex reads this file directly; Claude Code
loads it through `CLAUDE.md` (which contains only `@AGENTS.md`). The complete specification lives in **`docs/BUILD_SPEC.md`** — read the relevant
section(s) of it before starting any phase or feature. Track progress in **`docs/PROGRESS.md`**.

## What we are building

**Agentic Motor Claims** — an enterprise-grade, desktop-only web application (demo product by
AutomationEdge for a dummy insurer, **ABC**) that shows how a team of AI agents processes Indian
motor insurance claims end to end: FNOL intake (text + voice in any Indian language), document
reading, DPI verification (Vahan, FASTag, IIB — mocked), computer-vision damage assessment with
grounded cost estimation, explainable fraud scoring, adjudication, and customer communication.

Pages: Login · Home · Claim Detail · Dashboard · File a Claim (wizard → live Agent Theatre →
results) · WhatsApp Journey · Support · Profile/Settings · Dev Tools (developer only).

## Tech stack (do not substitute without asking the user)

- **Frontend:** React + Vite (JavaScript, not TypeScript), Tailwind CSS v4, React Router,
  TanStack Query, Zustand, TanStack Table + TanStack Virtual, React Hook Form + Zod,
  Motion (`motion/react`), anime.js v4, Apache ECharts (`echarts-for-react`), lucide-react, Sonner.
- **Backend:** Python 3.11+, FastAPI + Uvicorn, Pydantic v2, `google-genai` (Vertex mode),
  `sse-starlette`, `bcrypt`, `PyJWT`, `python-multipart`, Pillow, OpenCV (headless), Faker, aiofiles.
- **LLM:** Gemini on Vertex AI, model from `.env` (`GEMINI_MODEL=gemini-3.7-flash`), location `global`.
- **Persistence:** JSON files only, in `server/data/`. No database of any kind.

## Commands (Windows — the user runs Windows 11 with CMD/PowerShell)

```bash
# Backend (from /server)
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scripts/seed.py            # (re)generate all dummy JSON data + assets manifest
uvicorn app.main:app --reload --port 8000

# Frontend (from /client)
npm install
npm run dev                       # http://localhost:5173 — Vite proxies /api → :8000
npm run build && npm run preview  # production check
```

Write any helper scripts in Python or Node, never bash-only, so they run on Windows.

## Non-negotiable rules

1. **JSON only.** All data reads/writes go through `server/app/services/json_store.py`
   (async lock per file + write to temp file + `os.replace`). Never write JSON from anywhere else.
2. **Secrets.** The Vertex service-account key lives at `server/credentials/` (filename set in
   `.env` as `GOOGLE_APPLICATION_CREDENTIALS`). Never read it from the frontend, never print it,
   never commit it. `server/credentials/`, `.env`, `server/uploads/` are in `.gitignore`.
   Never call Gemini from the browser — only the Python server does.
3. **Money and scores are computed in Python, not by the LLM.** The LLM selects part codes,
   repair/replace operations, severity and evidence; `services/costing.py` computes every rupee and
   `services/dmn_engine.py` computes the risk score. If the LLM's own arithmetic disagrees, Python wins
   and the discrepancy is logged in the claim's audit trail.
4. **Structured output only.** Every Gemini call uses `response_mime_type="application/json"` and a
   Pydantic `response_schema`. Validate; on failure retry once with the validation error appended,
   then fall back to Demo mode for that step.
5. **Customer-safe language.** Anything shown to the `customer` role or sent to a customer must never
   mention fraud, risk scores, rules, SIU, or internal checks.
6. **Design tokens only.** Colours, font sizes, spacing, radii and shadows come from the tokens in
   `client/src/styles/tokens.css` (spec §6). No raw hex values or arbitrary pixel values in components.
   Minimum font size 12px. 4px spacing grid. Test at 1366×768 and 1920×1080.
7. **Status colours** (green / yellow / red / grey) always come with an icon AND a text label.
8. **Every data-driven component has four states:** loading (skeleton), empty, error (with retry),
   success. No raw spinners for page content, no broken-image icons, no unhandled promise rejections.
9. **Motion:** animate only `transform` and `opacity`; 150–250 ms micro, 300–500 ms page-level;
   respect `prefers-reduced-motion`. Motion owns React-state animation; anime.js owns counters,
   SVG line-drawing and scripted timelines. Never animate the same element with both.
10. **Desktop only.** Minimum supported width 1280px; below 1024px the sidebar becomes a drawer, but no
    mobile layouts are required.
11. **Brand logo:** use `client/public/assets/brand/automationedge-logo-trimmed.png` through the
    `BrandLogo` component, sized by width. Never redraw, recolour or further crop the artwork. The text
    wordmark is only a fallback if the image fails to load.
12. **App name** comes only from `client/src/config/app.js` (`APP_NAME = "Agentic Motor Claims"`) and
    the server's `APP_NAME` env var — never hard-code it elsewhere.
13. **Indian formatting:** `Intl.NumberFormat('en-IN')` for ₹ (₹1,25,000; compact ₹4.2 L / ₹3.1 Cr),
    dates `DD MMM YYYY`, times in IST.
14. **Dummy data must be internally consistent and look real.** Dashboard and stat-card numbers are
    always derived from `claims.json`, never stored separately or hard-coded.
15. **Colour roles.** Light mode backgrounds pure white; dark mode neutral charcoal greys (no navy).
    ORANGE = brand and action (primary buttons, active nav, selected controls). BLUE = data and AI
    (links, focus rings, charts, AI markers, avatars). GREY = structure. Green/amber/red = status only.
    Decorative colour (glows, dot grid) only inside hero/feature areas. Focus rings via `:focus-visible`
    only, never on mouse click.
16. **Data persistence.** Follow BUILD_SPEC.md §11.6. New claims are appended to `claims.json` with the
    same schema as seeded claims; uploads are stored privately in `server/uploads/<claim_id>/` and served
    only through the authenticated file endpoint; every write invalidates caches so all pages and stats
    include new claims instantly. Seeded and user-created claims render identically.
17. **Approved designs.** The Login and Home pages (reworked 2026-10-02) are approved. Do not change their
    design or behaviour unless the user explicitly asks. Reuse their components and conventions
    (`KpiCard`, `RiskChip`, `SegmentedControl`, `ClaimStatusBadge`, `Reveal`, tint tokens, TanStack Query
    hooks, URL state).

## Skills and tools

- **Claude Code is the primary builder.** It must use the **`ui-ux-pro-max`** skill for layout,
  hierarchy, chart choice and UX review of each screen (our tokens and colour roles override its palette),
  and the **`motion`** skill + **`motion` MCP** for every Motion animation
  (`import { motion, AnimatePresence } from "motion/react"`; never `framer-motion`).
- **If Codex is used as a fallback,** it builds strictly to BUILD_SPEC.md (these skills are not available
  to it), keeps all styling in tokens, and records visual compromises under "Known follow-ups" in
  `docs/PROGRESS.md` for the Phase 9 polish pass.
- For any other library, check current docs before using an API you are unsure of (anime.js v4 and
  Tailwind v4 both changed their APIs from earlier versions).

## Honesty, testing and usage-safe work

- No stubs, placeholders or hard-coded results presented as done. Tests must exercise the real code
  path, never assert against a hard-coded return. Anything incomplete goes under "Known follow-ups" and
  is stated plainly in the phase summary.
- Run plain `pytest -v` from `/server` (`pytest.ini` sets the path). After `python scripts/seed.py`,
  restart uvicorn (the JSON store caches in memory).
- Work in small sub-steps that each leave the app runnable (backend starts, `pytest -v` and
  `npm run build` pass). After each sub-step, update the "## Resume point" at the top of
  `docs/PROGRESS.md` (last completed sub-step, exact next sub-step, any temporary state). Write data
  files to a temp file and swap in when complete. If the user says "wrap up", finish the current
  sub-step cleanly and stop; if they say "resume", continue from the Resume point.
- Never commit to git; the user commits after testing.

## How to work

- Build strictly **phase by phase** (spec §19). Before a phase, re-read its section and acceptance
  criteria. At the end of each phase: run the app, verify every acceptance criterion, fix issues,
  update `docs/PROGRESS.md`, then **stop and give the user a short summary and how to test it** before
  starting the next phase.
- Prefer small, composable components. Feature code lives in `client/src/features/<feature>/`;
  shared UI in `client/src/components/ui/`.
- If something in the spec is ambiguous or impossible, make the most sensible choice, record it under
  "Decisions" in `docs/PROGRESS.md`, and mention it in the phase summary. Ask the user only when a
  choice is genuinely theirs to make.
- Never delete or overwrite `server/data/users.json` passwords set by the user; the seed script must
  preserve existing users.

## Users (dummy — stored in `server/data/users.json`)

| Username | Password | Role | Notes |
|---|---|---|---|
| Santosh Kute | Admin@123 | admin | Full access |
| Ameya Chauhan | 0376 | admin + developer | Full access + Dev Tools page |
| Rahul Sharma | Pass@123 | customer | Files claims; sees only own claims, customer-safe views |

When `DEMO_MODE=true`, the login page shows quick-login tiles that **fill** the username and password
into the form and focus Sign in; they never sign in automatically. Tile data (including these dummy
passwords) comes from `GET /api/auth/demo-accounts`, which returns 404 when `DEMO_MODE=false`.
There is no `/api/auth/demo-login` endpoint.
