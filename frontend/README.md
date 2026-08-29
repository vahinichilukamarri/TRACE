# TRACE Dashboard — Frontend

React + Tailwind implementation of the TRACE frontend spec ("Signal Intelligence"
design direction), wired directly to the FastAPI backend's actual routes
(`/cases`, `/evaluation`, `/dashboard`).

## Design system, in one paragraph

Dark technical rail (Obsidian) for navigation, light editorial "dossier" surface
(Bone/Mist) for content — a deliberate two-tone split so this reads as a
financial-infrastructure console, not a chat app or a generic AI SaaS
dashboard. Four signal colors carry meaning and nothing else: **orange**
(TRACE activity/in-progress), **mint** (recovered/approved), **amber**
(review/waiting), **red** (blocked/stopped/failed). Inter for UI text, IBM
Plex Mono for anything technical — payment IDs, timestamps, confidence
scores, amounts. No card-shadow soup: hairline borders and left-border
accents do the layout work instead.

## The signature component

`src/components/trace/RecoveryTraceLine.jsx` — the FAILURE → CONTEXT →
DECISION → POLICY → ACTION → OUTCOME → REASSESS → RESOLVED lifecycle strip.
It is **not decorative**: `stageStatesForCase()` in `src/lib/constants.js`
derives every node's done/active/pending state directly from a case's real
`decisions[]` / `policy_checks[]` / `executions[]` / `outcomes[]` arrays. It
renders full-size on the Case Investigation page and can drop to `variant="compact"`
anywhere else that needs it.

## Pages → backend routes

| Page | Route | Backend calls |
|---|---|---|
| Command Center | `/` | `GET /cases?source=live` (client-side aggregation — there's no live-scoped overview endpoint) |
| Recovery Cases | `/cases` | `GET /cases` (paginated) + `GET /cases/{id}` per visible row for latest decision |
| Case Investigation | `/cases/:paymentId` | `GET /cases/{id}`, `POST /cases/{id}/reassess`, `POST /cases/{id}/click` |
| Performance | `/performance` | `GET /dashboard/comparison`, `/dashboard/failures`, `/dashboard/decisions` (all scoped to the selected `eval_run_id`) |
| Policy Control | `/policy` | `GET /dashboard/decisions` for live policy-result counts; guardrail thresholds are reference values mirroring `backend/.env.example` (the API has no settings endpoint yet — see note below) |

The top bar's evaluation-run picker and "Run Evaluation" button
(`src/lib/EvalRunContext.jsx`) drive `POST /evaluation/run` and are shared
by Performance and Policy Control, since both are scoped to a batch run.

## Setup

```bash
cd frontend
npm install
cp .env.example .env    # points at your backend, defaults to localhost:8000
npm run dev              # http://localhost:5173
```

Make sure the backend is running first (`python run.py` in `backend/`) and
has at least one evaluation run (`POST /evaluation/run` or the "Run
Evaluation" button) before visiting Performance or Policy Control — both
show an empty state until a run exists.

## Known gap

The Policy Control page's guardrail thresholds (max attempts, recovery
window, confidence floor, etc.) are hardcoded to match `backend/.env.example`
because the backend doesn't currently expose a `GET /config` or similar
settings endpoint. If you want these to be live and always accurate, add a
small endpoint that returns `settings.__dict__` (minus secrets) and swap the
static `POLICY_RULES` array in `src/pages/PolicyControlCenter.jsx` for a
fetch.

## A note on testing

This was built in a network-disabled sandbox, so `npm install` / `npm run
build` could not actually be executed here. Every file was checked with
`esbuild` for JSX/JS syntax validity and every relative import was verified
to resolve to a real file, and every API call was cross-checked against the
backend's actual routers/schemas — but you should run `npm run build`
yourself before the demo to catch anything that only surfaces at bundle
time.
