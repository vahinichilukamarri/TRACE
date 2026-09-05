# TRACE — Frontend

React 19 + Vite + Tailwind CSS v4 + Recharts + React Router 7. A "Ledger" design
system: cases render as settlement documents on a dark desk, and every verdict a
human would want to double-check is stamped in one of three reserved colors.

Deployed at <https://trace-xi-nine.vercel.app>. Requires the TRACE FastAPI backend
(deployed at <https://trace-backend-4uu2.onrender.com>, or run locally — see
[backend/README.md](../backend/README.md)).

---

## Table of contents

1. [Page-by-page tour](#1-page-by-page-tour)
2. [The design system, and why](#2-the-design-system-and-why)
3. [The ingest flow and its demo presets](#3-the-ingest-flow-and-its-demo-presets)
4. [Component structure](#4-component-structure)
5. [Dev setup](#5-dev-setup)

---

## 1. Page-by-page tour

| Route | Page | What it shows |
|---|---|---|
| `/` | **Landing** | The argument, outside the app chrome: a hero adjudication pulled live from real recorded cases, then a seven-card deck (the problem → the six actions → the nine policy rules → the recovery loop → the two engines → measured results → the audit trail). |
| `/dashboard` | **Command Center** | Headline metrics for the selected run, a live recovery flow, cases needing attention, and the entry point to run a new evaluation batch. |
| `/cases` | **Recovery Cases** | The intelligence queue — filterable by status, scoped to either an evaluation run or "Live cases only" (the ones you individually ingest in a demo). |
| `/cases/:paymentId` | **Case Investigation** | The money page: the full adjudication record for one case — proposal, reasoning, EV breakdown, every policy check, execution details, outcome, and the ordered audit timeline. Reassess / simulate-link-click actions live here for live (non-batch) cases. |
| `/performance` | **Performance** | TRACE vs. static baseline — hero recovery-value-per-intervention stat, the effort-against-return frontier, "the thesis" (cases correctly never pursued), and the full metric table. |
| `/policy` | **Policy & Control** | Every guardrail, threshold, recovery window, and intervention cost, read live from `GET /policy/config` — never a hand-maintained copy that could drift. |

The Landing page renders **without** the app shell (no sidebar, no run selector) —
it's the front door, not a console view. Everything else lives inside `AppShell`, a
collapsible left rail (`Command center` / `Recovery cases` / `Performance` /
`Policy & control`) plus a top bar with a jump-to-payment-ID search.

## 2. The design system, and why

The system is called **Ledger** on purpose: a recovery case is treated as a
**settlement document**, not a dashboard widget. `Instrument Serif` for headings and
`IBM Plex Mono` for numbers give every record the weight of something that's been
written down, not generated. Two grounds carry it:

- **Paper** (cream, `#F4EEE1`) — the document surface. Every case, decision, and
  policy check renders as a document on this ground, in the console pages.
- **Void** (warm near-black, `#0E0B08`, never pure black — a cool black next to
  cream reads as a rendering error) — the desk the documents sit on: the app chrome,
  the landing page.

**Electric blue (`#2F30FF`) is the only saturated accent in the entire system**, and
it means exactly one thing: *this is TRACE acting*. It marks the agent's own
activity — the CTA, the active nav item, TRACE's series in a chart — and nothing
else may use it. That restriction is deliberate: the three colors that actually judge
something are reserved and never reused for decoration —

| Color | Meaning | Where it appears |
|---|---|---|
| **Approve** (green, `#0E7C55`) | Policy `APPROVED` / outcome `RECOVERED` | Verdict stamps, status dots, the TRACE series when it's winning |
| **Block** (red, `#B3261E`) | Policy `BLOCKED` / status `STOPPED` | Verdict stamps, status dots |
| **Hold** (amber, `#A87708`) | Policy `FLAGGED_FOR_REVIEW` / status `ESCALATED` / `EVALUATION_UNAVAILABLE` | Verdict stamps, status dots |

Blue is deliberately *not* used for anything that could be confused with a verdict —
if the accent and a judgment shared a color, "TRACE did something" and "TRACE was
right" would look like the same claim. `src/lib/domain.js` is the single source of
truth mapping every backend enum (`STATUS_SIGNAL`, `POLICY_SIGNAL`, `OUTCOME_SIGNAL`,
`DECISION_SIGNAL`) to one of these three plus the accent — component logic keys off
the signal *names*, so only the color values move if the palette ever changes.

The **hero adjudication** on the landing page is the metaphor made literal: three
real verdicts pulled from the running system's own recorded decisions (not mockups —
one is the single repeat-limit policy block found in 7,215 recorded checks, where an
LLM proposal claimed a recovery link "has not yet been used" when it had in fact been
sent twice), replayed as a proposal → reasoning → rule-by-rule policy check →
stamped verdict sequence.

## 3. The ingest flow and its demo presets

**Recovery Cases → Simulate failed payment** (`SimulateFailureDialog.jsx`) pushes one
real payment-failure event through `POST /cases/ingest` and lands you on that case's
Investigation view. Four presets, each built to reliably exercise one specific
backend behavior on camera rather than depending on a lucky random draw:

| Preset | Exercises |
|---|---|
| **Standard decline** | HEURISTIC decides the first pass; a second reassessment typically routes to the LLM |
| **High-value, prior attempt failed** | ROUTED trigger 3 — routes to the LLM immediately (₹95,000, one failed prior attempt) |
| **Ambiguous free-text failure** | Live LLM *classification* (no structured failure code given) |
| **Expired bank timeout** | Policy rule 3 — force-stopped for being past the 60-minute NPCI window |

The dialog also reads `GET /policy/config`'s `email_delivery.smtp_configured` flag
live, so it never promises a real email will send when the deployed backend has no
SMTP configured — it's honest about SIMULATED vs. REAL delivery before you submit,
not just after.

## 4. Component structure

- **`src/api/client.js`** — every backend call, plus error formatting (FastAPI's
  422 `detail` is an array, not a string).
- **`src/lib/domain.js`** — enums and signal-color mappings mirrored exactly from
  `app/enums.py`. If the backend adds a value here, this file needs the matching
  entry — it's aspirational to keep them mechanically in sync, but this is the file
  that would need editing.
- **`src/lib/caseStage.js`, `src/lib/caseGrouping.js`** — derive the Recovery Trace
  Line stage and group a case's decision/policy/execution/outcome records into
  per-iteration rounds for Case Investigation.
- **`src/components/`** — shared design-system building blocks (`RecoveryTraceLine`
  is the signature one; `RunSelector` powers the run-scoping described below).
- **`src/components/landing/`** — the seven-card deck and hero adjudication, kept
  separate from the console components since the landing page is a different
  rendering context (no shell, heavier motion budget).
- **`src/pages/`** — the six routes in the table above.

**Run scoping.** Batch runs accumulate, so every data page carries a `RunSelector`:
Command Center and Performance default to the most recent run; Recovery Cases
defaults to "Live cases only" (the cases you individually ingest in a demo, which
don't shift when a new batch runs). The selection lands in the URL
(`?eval_run_id=...`), so views are shareable and survive a refresh.

## 5. Dev setup

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL if your backend isn't on localhost:8000
npm run dev
```

Requires the TRACE FastAPI backend running (see [../backend](../backend)) — or point
`VITE_API_BASE_URL` at the deployed one:
`https://trace-backend-4uu2.onrender.com`. CORS on the backend defaults to the
deployed frontend origin only; add your local dev origin via `CORS_ORIGINS` in
`backend/.env` if you're running both locally.

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
npm run lint       # oxlint
```
