# TRACE Frontend

Signal Intelligence design system frontend for TRACE (Transaction Recovery
Agent with Contextual Evaluation), built with React + Vite + Tailwind CSS v4.

## Setup

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL if your backend isn't on localhost:8000
npm run dev
```

Requires the TRACE FastAPI backend running (see ../trace_backend). CORS is
wide open on the backend by default, so no extra config is needed for local dev.

## Pages

- `/` — Command Center: headline metrics, live recovery flow, cases needing attention
- `/cases` — Recovery Cases: filterable intelligence queue
- `/cases/:paymentId` — Case Investigation: full forensic view of one case, including
  reassess / simulate-link-click actions for live (non-evaluation-batch) cases
- `/performance` — TRACE vs Static Baseline comparison
- `/policy` — Policy & Control Center, reading live config from `GET /policy/config`

## Structure

- `src/api/client.js` — all backend calls
- `src/lib/domain.js` — enums + semantic color mapping mirrored from the backend
- `src/lib/caseStage.js`, `src/lib/caseGrouping.js` — derive the Recovery Trace Line
  stage and group decision/policy/execution/outcome records into per-iteration rounds
- `src/components/` — reusable design-system components (RecoveryTraceLine is the
  signature one)
- `src/pages/` — the five pages above

## Build

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally
```
