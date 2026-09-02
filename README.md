# TRACE — Transaction Recovery Agent with Contextual Evaluation

A bounded AI agent for **failed-payment revenue recovery**. TRACE decides whether a
failed transaction is worth pursuing, picks the single best next intervention,
executes it, observes the outcome, adapts, and knows when to stop — and proves its
value against a static baseline workflow on the same data.

The guiding principle is **"maximize intelligent effort, not attempt count."** A dumb
retry loop burns money on transactions that were never going to recover. TRACE spends
effort where the expected value justifies it.

> **Agent decides. Policy controls.**
> The agent proposes. A deterministic, LLM-independent policy layer disposes. Nothing
> executes without passing it, and every step is written to an immutable audit trail.

---

## Table of contents

1. [Repository layout](#1-repository-layout)
2. [Quickstart](#2-quickstart)
3. [How the recovery loop works](#3-how-the-recovery-loop-works)
4. [Core domain model](#4-core-domain-model)
5. [The agent](#5-the-agent)
6. [The policy & control layer](#6-the-policy--control-layer)
7. [Execution, email, and real-vs-simulated](#7-execution-email-and-real-vs-simulated)
8. [Audit trail & idempotency](#8-audit-trail--idempotency)
9. [Batch evaluation harness](#9-batch-evaluation-harness)
10. [Metrics](#10-metrics)
11. [API reference](#11-api-reference)
12. [Frontend](#12-frontend)
13. [Configuration](#13-configuration)
14. [Testing](#14-testing)
15. [Operational notes](#15-operational-notes)
16. [Known limitations & open decisions](#16-known-limitations--open-decisions)

---

## 1. Repository layout

```
trace/
├── backend/                  FastAPI + SQLAlchemy + SQLite service
│   ├── app/
│   │   ├── main.py           App factory, CORS, router registration
│   │   ├── config.py         All settings, env-overridable
│   │   ├── database.py       Engine, session, SQLite WAL pragmas, init_db
│   │   ├── models.py         ORM models (the whole persistence schema)
│   │   ├── schemas.py        Pydantic request/response contracts
│   │   ├── enums.py          Bounded vocabularies (actions, statuses, ...)
│   │   ├── classification.py Failure message -> FailureType
│   │   ├── agent.py          Decision engines (heuristic + LLM) & EV economics
│   │   ├── policy.py         Deterministic guardrails
│   │   ├── execution.py      Side effects (email, simulated payment outcomes)
│   │   ├── engine.py         Orchestration: one iteration, and the bounded loop
│   │   ├── audit.py          Append-only event log helper
│   │   ├── idempotency.py    One case per payment_id, ever
│   │   ├── baseline.py       The static workflow TRACE is measured against
│   │   ├── evaluation/       Batch harness + metrics
│   │   ├── simulation/       Synthetic dataset + hidden outcome model
│   │   └── routers/          cases, evaluation, dashboard, policy_info
│   ├── tests/                pytest suite (42 tests)
│   └── requirements.txt
│
└── frontend/                 React 19 + Vite + Tailwind v4 + Recharts
    └── src/
        ├── pages/            Command Center, Recovery Cases, Case
        │                     Investigation, Performance, Policy & Control
        ├── components/       Design-system building blocks
        ├── lib/              Domain constants, formatting, case grouping
        ├── hooks/useApi.js   Tiny fetch/loading/error hook
        └── api/client.js     API wrapper
```

---

## 2. Quickstart

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On macOS/Linux use `source venv/bin/activate` instead.

Interactive API docs: <http://localhost:8000/docs>

The SQLite database (`backend/trace.db`) is created automatically on first start.
There is no migration step — but see [Operational notes](#15-operational-notes) if you
change the schema.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on <http://localhost:5173> and expects the backend on `http://localhost:8000`
(override with `VITE_API_BASE_URL` in `frontend/.env`).

### First run

1. Open the **Command Center**.
2. Click **Run new evaluation** — this generates 300 synthetic failed payments and
   runs each one through *both* TRACE and the static baseline (~10-15 s).
3. Explore **Performance** for the head-to-head comparison, and **Recovery Cases ->
   Case Investigation** to see exactly why TRACE did what it did on any single case.

---

## 3. How the recovery loop works

```
Payment failure event
        │
        ▼
  Idempotency check ──(duplicate)──► log duplicate, return existing case
        │ (new)
        ▼
  Classification            structured code -> LLM (live only) -> keyword fallback
        │
        ▼
  Agent decision            "Worth pursuing? Which of the 6 actions?"
        │                   + expected value / cost / net expected value
        ▼
  Policy check              APPROVED · BLOCKED · FLAGGED_FOR_REVIEW
        │
        ▼
  Execution                 real: email + logging
        │                   simulated: payment completion (always labeled)
        ▼
  Outcome observed
        │
        ▼
  State advanced            time elapses, attempts spent, opportunities decrement
        │
        ▼
  Reassess (bounded) ──► RECOVERED · STOPPED · ESCALATED · EXPIRED
        │
        ▼
  Audit trail               every step above, permanently, in order
```

`app/engine.py` owns this orchestration and is shared by **both** the live API and the
batch harness, so they cannot drift apart:

- `run_iteration()` — exactly one DECIDE -> POLICY -> EXECUTE step.
- `advance_case_state()` — moves the case forward so the *next* pass sees genuinely
  different context (this is what makes the loop converge).
- `run_to_completion()` — the batch loop: iterate until terminal or the iteration
  bound, then force `STOP_RECOVERY`.

The live route `POST /cases/{id}/reassess` calls `run_iteration()` +
`advance_case_state()` and enforces the same `MAX_REASSESSMENT_ITERATIONS` bound, so a
live case converges exactly like a batch one.

---

## 4. Core domain model

### Bounded action space (6, and only 6)

| Action | Meaning | Direct recovery? |
|---|---|---|
| `RETRY_PAYMENT` | Re-attempt the charge | yes |
| `SEND_RECOVERY_LINK` | Email a payment link | yes |
| `SUGGEST_ALTERNATIVE_METHOD` | Email suggesting another method | yes |
| `WAIT_AND_REASSESS` | Do nothing now; re-evaluate later | no |
| `ESCALATE_FOR_REVIEW` | Route to a human | no |
| `STOP_RECOVERY` | Give up, close the case | no |

The agent can never invent an action, change an amount, move real money, or contact a
customer outside these paths.

### Failure types

`BANK_TIMEOUT` · `CARD_DECLINED` · `INSUFFICIENT_FUNDS` · `AUTH_FAILURE` ·
`PROCESSING_ERROR` (the fallback bucket)

### Case statuses

`OPEN` -> `RECOVERED` | `STOPPED` | `ESCALATED`

`EXPIRED` also exists in the enum and is treated as terminal by the engine and policy
layer, but nothing currently assigns it — window expiry resolves to `STOPPED` via the
forced-action path instead.

### Persistence schema

| Table | Purpose |
|---|---|
| `recovery_cases` | The single mutable current state per `payment_id` |
| `agent_decisions` | Every decision, with confidence, reasoning, and EV economics |
| `policy_checks` | Every guardrail evaluation and its result |
| `executions` | Every side effect, REAL or SIMULATED |
| `outcomes` | Recovered / not recovered / pending, and revenue |
| `audit_log_entries` | Append-only ordered trail of everything |
| `processed_events` | Idempotency ledger (one row per `payment_id` ever seen) |
| `evaluation_runs` / `evaluation_results` | Batch runs and their computed metrics |

---

## 5. The agent

Two interchangeable engines behind one interface, selected by `AGENT_MODE`.

### `HEURISTIC` (default)

Deterministic, explainable, no network calls, fully reproducible. For each failure
type it holds a table of base "fit" weights per action, then scores candidates:

```
probability = base_fit
            × (0.4 + 0.6 × customer_success_rate)     # customer history
            × max(0.3, 1 − 0.2 × previous_attempts)   # diminishing returns
            clamped to [0.02, 0.95]

expected_value = amount × probability
```

It picks the highest-expected-value action, excluding one that was just tried and
failed. It hard-stops when there are no opportunities left, escalates when
classification confidence is too low (< 0.35), stops when expected value no longer
justifies the effort, and escalates high-value transactions after a failed attempt
rather than continuing to automate.

This is a genuine contextual decision engine — it reasons case by case about value,
history, failure type, engagement, and prior attempts. That is exactly what the static
baseline does *not* do.

### `LLM`

A real Groq call returning structured JSON, constrained to the same action space. Used
for the live/demo path. **If the call fails, TRACE does not silently fall back to the
heuristic engine** — it surfaces `ESCALATE_FOR_REVIEW` with `is_fallback=true`, because
quietly swapping decision engines would be dishonest about what actually reasoned.

The client is bounded (`timeout=15s`, `max_retries=0`) so a slow API can never stall a
request or hold a database transaction open.

### Expected-value economics

Every decision — from *either* engine — is annotated with:

| Field | Meaning |
|---|---|
| `expected_value` | `amount × estimated recovery probability` (₹) |
| `intervention_cost` | Rough operating cost of the chosen action (₹) |
| `net_expected_value` | `expected_value − intervention_cost` |

Costs: `RETRY_PAYMENT` ₹0.50 · `SEND_RECOVERY_LINK` ₹2 ·
`SUGGEST_ALTERNATIVE_METHOD` ₹2 · `WAIT_AND_REASSESS` ₹0 · `ESCALATE_FOR_REVIEW` ₹150 ·
`STOP_RECOVERY` ₹0

Only the three **direct-recovery** actions can complete a payment this turn, so only
they earn expected value; the rest carry their cost with no offset.

Crucially, the probability is computed by a shared deterministic function
(`_estimate_probability`) regardless of which engine decided. That is what makes
"expected value" **auditable** rather than just another model output.

---

## 6. The policy & control layer

`app/policy.py` is 100% deterministic with zero dependency on the agent. It would
behave identically no matter what produced the proposed action — which is what makes
TRACE's safety properties verifiable independently of the AI.

| # | Rule | Result |
|---|---|---|
| 1 | Case already `RECOVERED` | BLOCKED |
| 2 | Case already `STOPPED` / `EXPIRED` | BLOCKED |
| 3 | Recovery window expired | BLOCKED -> forced `STOP_RECOVERY` |
| 4 | `previous_recovery_attempts >= MAX_RECOVERY_ATTEMPTS` | BLOCKED -> forced `STOP_RECOVERY` |
| 5 | No remaining recovery opportunities | BLOCKED -> forced `STOP_RECOVERY` |
| 6 | Same action repeated beyond `MAX_SAME_ACTION_REPEATS` | BLOCKED -> `ESCALATE_FOR_REVIEW` |
| 7 | Agent confidence below `POLICY_MIN_CONFIDENCE` | FLAGGED_FOR_REVIEW |
| 8 | High-value transaction stopped on the very first attempt | FLAGGED_FOR_REVIEW |
| 9 | Everything passed | APPROVED |

### Per-failure-type recovery windows

The window in rule 3 is not flat:

| Failure type | Window | Why |
|---|---|---|
| `BANK_TIMEOUT` | **60 min** | NPCI mandates auto-reversal of most failed UPI transactions within ~60 minutes. Past that the money is already back with the customer, so continued automated recovery is moot. |
| everything else | 4320 min (3 days) | No equivalent regulatory auto-reversal. |

Both values are surfaced through `GET /policy/config` so the UI never hard-codes a copy
that could drift.

---

## 7. Execution, email, and real-vs-simulated

TRACE never blurs the line between what actually happened and what was simulated.

| Real | Simulated |
|---|---|
| Email delivery (when explicitly enabled) | Payment completion / failure |
| Link click-through events | Recovered revenue amounts |
| All system + audit logging | Customer engagement in batch mode |

Every `ExecutionRecord` carries `execution_type` (`REAL` or `SIMULATED`), every
`OutcomeRecord` carries `simulated`, and the UI labels both.

### Email safety

Recovery emails are fully rendered (branded HTML + plain-text fallback, dynamic urgency
copy driven by the case's *real* remaining attempts, and an idempotency reassurance
line). But a **real SMTP send only happens when explicitly opted in** — that is, when
the case carries a deliberately-set `customer_email`.

Without it, execution falls back to a `customer+<payment_id>@example.com` placeholder
and delivery is recorded as `SIMULATED`, with the full rendered body kept in the audit
trail so you can see exactly what *would* have been sent.

This matters: batch evaluation touches hundreds of cases, and mailing fake addresses
for real would be both wrong and ruinously slow (~1.5 s of network per send, inside an
open database transaction).

To deliberately receive a real email:

```jsonc
// live ingest
POST /cases/ingest   { "...": "...", "customer_email": "you@example.com" }

// or route the first N cases of a batch to a real inbox
POST /evaluation/run { "dataset_size": 300, "demo_email": "you@example.com",
                       "demo_email_count": 2 }
```

Only the TRACE copy of a demo case gets the real address, so you never receive two
emails for the same underlying transaction.

---

## 8. Audit trail & idempotency

**Audit.** Every classification, decision, policy check, execution, outcome,
reassessment, status change, and engagement event is appended to `audit_log_entries`
with a payload and timestamp. Any case can be fully explained after the fact — that is
what the Case Investigation page renders.

**Idempotency.** `processed_events` holds one row per `payment_id` ever accepted. If
the same event arrives again, TRACE does **not** create a duplicate case, rerun the
agent, resend an email, or re-execute an action. It increments a duplicate counter,
logs a `DUPLICATE_EVENT`, and returns the existing case.

---

## 9. Batch evaluation harness

`POST /evaluation/run` generates N synthetic failed payments and runs **the same
dataset** through both systems with **matched per-case RNG seeds**, so differences in
outcome are driven by the decisions made, not by lucky draws.

- **TRACE** — full contextual agent + policy + bounded reassessment loop.
- **BASELINE** — `app/baseline.py`: one fixed `failure_type -> action` mapping, executed
  exactly once, with no awareness of value, history, or engagement, and no policy layer.
  This is the "retry -> wait -> remind -> stop" pattern TRACE improves on.

A **hidden outcome model** (`app/simulation/hidden_outcome_model.py`) decides whether an
action actually recovers the payment. The agent never sees it — it must infer what works
from context alone.

Two properties the harness guarantees:

- **Reproducible.** Pass an explicit `seed` and you get a byte-identical run.
  Classification inside the batch is forced deterministic (no LLM calls), because a
  network call per case both takes ~10 minutes and destroys reproducibility.
- **Serialized.** SQLite allows one writer; a second concurrent run gets a clean `409`
  instead of racing and corrupting the first.

Omit `seed` and the API picks a **fresh random one** — clicking "Run new evaluation"
should produce a genuinely new batch, not silently replay the same dataset.

---

## 10. Metrics

Computed purely from persisted rows (`app/evaluation/metrics.py`) — nothing is
hand-tuned. If the simulation behaves badly, the numbers show it.

| Metric | Meaning |
|---|---|
| `total_failed_payments` | Cases in the run |
| `revenue_at_risk` | Sum of failed transaction amounts |
| `recovery_attempts` | Active interventions executed |
| `transactions_recovered` | Cases ending `RECOVERED` |
| `revenue_recovered` | Simulated recovered revenue |
| `recovery_rate` | recovered / total |
| `unnecessary_interventions` | Active interventions on cases that never recovered |
| `interventions_avoided` | Cases correctly not pursued at all |
| `cases_stopped` / `cases_escalated` | Terminal dispositions |
| `policy_blocked_actions` | Proposals the control layer refused |
| **`recovery_value_per_intervention`** | **The headline efficiency number** |

### Recovery efficiency frontier

`GET /dashboard/frontier` returns, per system, a cumulative
`(interventions, revenue_recovered)` curve with each system's **best value-density cases
spent first**. A curve that climbs faster per intervention is recovering more revenue
for the same effort — the visual form of the core thesis.

---

## 11. API reference

### Cases

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/cases/ingest` | Ingest a payment-failure event; runs the first iteration unless `?run_first_iteration=false` |
| `POST` | `/cases/{payment_id}/reassess` | One more bounded reassessment pass |
| `POST` | `/cases/{payment_id}/click` | Simulate the customer clicking the recovery link |
| `GET` | `/cases/{payment_id}` | Full case detail: decisions, policy checks, executions, outcomes, audit log |
| `GET` | `/cases` | List/filter cases — `status`, `system`, `source`, `eval_run_id`, `limit`, `offset` |

### Evaluation

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/evaluation/run` | Run a batch — `dataset_size`, `seed`, `demo_email`, `demo_email_count` |
| `GET` | `/evaluation/runs` | List recent runs |
| `GET` | `/evaluation/runs/{run_id}` | Fetch one run's stored metrics |

### Dashboard

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/dashboard/overview` | Headline metrics for one system |
| `GET` | `/dashboard/failures` | Breakdown by failure type |
| `GET` | `/dashboard/decisions` | Action + policy-result distribution |
| `GET` | `/dashboard/comparison` | TRACE vs BASELINE, same batch |
| `GET` | `/dashboard/frontier` | Recovery-efficiency frontier curves |

All dashboard endpoints accept `?eval_run_id=`. Omitted, they resolve to the **latest
completed run** — a run only counts as complete once its `evaluation_results` rows are
written, so the dashboard never latches onto a batch that is still being generated.

### Policy

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/policy/config` | Live thresholds, per-failure-type windows, intervention costs, and every rule description |

---

## 12. Frontend

React 19 + Vite + Tailwind CSS v4 + Recharts + React Router 7, in a dark "Signal
Intelligence" design system: obsidian surfaces, bone text, and semantic signal colors
(orange = TRACE activity, mint = recovered, amber = review, red = stopped/blocked).

| Route | Page | What it shows |
|---|---|---|
| `/` | **Command Center** | Revenue at risk, recovered, recovery rate, efficiency; live recovery flow; cases needing attention; the *Run new evaluation* trigger |
| `/cases` | **Recovery Cases** | The intelligence queue, filterable by status and scoped to either live cases or a specific batch run |
| `/cases/:paymentId` | **Case Investigation** | The money page: full reasoning, EV breakdown, policy verdicts, execution details, outcome, and the ordered audit timeline |
| `/performance` | **Performance** | TRACE vs baseline — hero efficiency stat, revenue bars, efficiency frontier, full metric table |
| `/policy` | **Policy & Control** | Every guardrail, threshold, recovery window, and intervention cost, read live from the backend |

### Run scoping

Batch runs accumulate. Every data page carries a **`RunSelector`** so you always know
which batch you are looking at:

- Command Center and Performance default to the most recent run.
- Recovery Cases defaults to **"Live cases only"** — the individually-ingested demo
  cases you actually click through in a demo, which don't shift when a new batch runs.
- The selection is reflected in the URL (`?eval_run_id=...`), so views are shareable and
  survive a refresh, and deep links (e.g. "View all escalated") land on the right run.

---

## 13. Configuration

All settings live in `app/config.py` and are overridable via `backend/.env`.

| Setting | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./trace.db` | Database connection |
| `AGENT_MODE` | `HEURISTIC` | `HEURISTIC` or `LLM` |
| `GROQ_API_KEY` / `GROQ_MODEL` | — | Live LLM path (classification + decisions) |
| `AGENT_MIN_CONFIDENCE` | `0.5` | Agent's own confidence floor |
| `MAX_RECOVERY_ATTEMPTS` | `3` | Hard attempt ceiling |
| `RECOVERY_WINDOW_MINUTES` | `4320` | Default recovery window (3 days) |
| `RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT` | `60` | NPCI auto-reversal window |
| `MAX_SAME_ACTION_REPEATS` | `1` | Never hammer one action |
| `HIGH_VALUE_THRESHOLD` | `50000` | ₹ threshold for extra human oversight |
| `POLICY_MIN_CONFIDENCE` | `0.4` | Below this -> human review |
| `MAX_REASSESSMENT_ITERATIONS` | `4` | Hard bound on the autonomous loop |
| `SMTP_*` | — | Real email; leave blank for simulated sends |
| `SMTP_TIMEOUT_SECONDS` | `15` | Never let a hung SMTP call stall a request |
| `SIMULATION_SEED` | `42` | Default seed for direct/programmatic runs |
| `DEFAULT_BATCH_SIZE` | `300` | Default dataset size |

Frontend: `frontend/.env` -> `VITE_API_BASE_URL` (default `http://localhost:8000`).

---

## 14. Testing

```bash
cd backend && pytest -q
```

42 tests, ~15 s.

| File | Covers |
|---|---|
| `test_agent.py` | Decision quality, bounded action space, safe LLM fallback |
| `test_policy.py` | Every guardrail rule independently |
| `test_classification.py` | Structured codes, keyword fallback, never-guess behavior |
| `test_idempotency.py` | Duplicate events never double-process |
| `test_evaluation.py` | Both systems produce metrics; same seed reproduces; attempt bounds hold |
| `test_integration.py` | Full API surface, including live reassessment convergence |

Frontend:

```bash
cd frontend && npm run build && npm run lint
```

---

## 15. Operational notes

**Schema changes need a fresh database.** `create_all` creates missing *tables*, not
missing *columns*. After a model change, stop the server and delete `trace.db`,
`trace.db-wal`, and `trace.db-shm`. (Newly declared *indexes* are handled automatically
by `init_db`.)

**SQLite runs in WAL mode** with a 30 s busy timeout, so dashboard reads and a running
batch don't block each other. If you ever see `database is locked`, it means a process
is holding a stranded write transaction — stop every `python`/`uvicorn` process and
delete the `trace.db*` files.

**One evaluation at a time.** A second concurrent `POST /evaluation/run` returns `409`.
This is deliberate: overlapping writers were what previously left half-finished runs and
stranded locks.

**Batch runs never make network calls.** Classification is forced deterministic and
email is simulated, so a 300-case run takes ~10-15 s instead of ~10 minutes.

**Run time grows with database size.** Each run adds ~600 cases plus child rows.
Deleting `trace.db` resets it.

---

## 16. Known limitations & open decisions

These are deliberate scope choices, documented rather than hidden.

- **No real payment gateway.** Payment completion is simulated by the hidden outcome
  model. Every simulated value is labeled as such throughout the API and UI.
- **The baseline currently out-performs TRACE on total recovery** in the default
  dataset. This is a *data* problem, not an agent problem: the synthetic generator
  produces `time_since_failure_minutes` with a median of ~1535 min, so ~97 of 99
  `BANK_TIMEOUT` cases arrive already past the 60-minute NPCI window and TRACE's policy
  layer correctly force-stops them — while the baseline, which has no policy layer at
  all, acts on them anyway. Making the benchmark meaningful means giving `BANK_TIMEOUT`
  cases realistic fresh ages in `simulation/generator.py`. Left as an explicit decision,
  because tuning a benchmark so the product wins is a call the project owner should make.
- **`POST /cases/{id}/click` is not idempotent.** Repeated calls append additional
  outcome rows rather than being rejected. The UI guards against this (the button only
  appears while engagement is `LINK_SENT`), but the endpoint itself is still open.
- **Single-process assumptions.** The evaluation lock is in-process and SQLite is
  single-writer. Fine for a demo; a multi-worker deployment would need Postgres and a
  shared lock.
- **No authentication.** CORS is wide open and every endpoint is unauthenticated.
