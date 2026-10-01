# Agentic Motor Claims

Demo product by **AutomationEdge** for a dummy Indian insurer, **ABC General Insurance**: a team of AI
agents that takes a motor claim from FNOL to a decision — reading documents, verifying against
(mocked) Vahan / FASTag / IIB, assessing damage, scoring fraud explainably and communicating with the customer.

- Full specification: [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md)
- Build progress and decisions: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- Standing rules for Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Prerequisites (Windows 11)

- **Node.js 20+** (tested on 24) and npm
- **Python 3.11+** (tested on 3.12)

## Setup from a fresh clone

Open two terminals (CMD or PowerShell).

### 1 · Backend (`server/`)

```bat
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Then edit `server/.env` and set `JWT_SECRET` to a long random string.
Check it is running: <http://localhost:8000/api/system/status>.

> From Phase 2 on you will also run `python scripts/seed.py` to generate the dummy JSON data.

### 2 · Frontend (`client/`)

```bat
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api/*` to the backend on port 8000.

Production check: `npm run build && npm run preview` (serves on <http://localhost:4173>).
Contrast check for both themes: `npm run contrast`.

## Where to put the two files you supply

| File | Location | Notes |
|---|---|---|
| AutomationEdge logo | `client/public/assets/brand/automationedge-logo.svg` (or `.png`) | Until it exists, the app shows a text wordmark. |
| Vertex AI service-account key | `server/credentials/vertex-key.json` | Filename is set by `GOOGLE_APPLICATION_CREDENTIALS` in `server/.env`. Git-ignored. Without it the app runs in **Demo mode** (pre-recorded AI responses). |

## Project layout

```
client/   React + Vite (JavaScript), Tailwind CSS v4, Motion, anime.js, ECharts, TanStack Query/Table/Virtual
server/   FastAPI (Python), JSON files in server/data/ — no database
docs/     BUILD_SPEC.md (spec), PROGRESS.md (phase checklist + decisions)
```

## Useful routes (Phase 1)

- `/styleguide` — design tokens and every shared component in every state (developer only)
- `/settings` — theme (light / dark / system), table density, sidebar

Keyboard: `Ctrl+K` command palette · `Ctrl+B` collapse sidebar · `?` shortcuts.
