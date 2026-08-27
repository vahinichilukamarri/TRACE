# TRACE — Transaction Recovery Agent with Contextual Evaluation

**Razorpay AI Buildathon — Track 03: AI Revenue Recovery**

A bounded AI revenue-recovery agent that decides whether a failed payment is
worth pursuing, selects and executes the most appropriate next intervention,
adapts after outcomes, and proves its value against a static baseline
workflow — with a deterministic policy layer, a full audit trail,
idempotent event handling, and a reproducible batch-evaluation harness.

This repo is the **backend + dataset** for TRACE. It is a complete,
runnable FastAPI service backed by SQLite, plus a synthetic recovery-case
dataset and the simulation harness that generates it.

---

## 1. Architecture at a glance

```
Payment failure event
        │
        ▼
 Idempotency check ──(duplicate)──► log + return existing case
        │ (new)
        ▼
 Failure classification  (deterministic map, or LLM/keyword fallback
                           for free-text messages — never guesses)
        │
        ▼
 TRACE agent decision   (HEURISTIC engine by default, or LLM mode)
   "Is recovery worth pursuing? What's the best next action?"
        │
        ▼
 Policy & control layer  (100% deterministic, independent of the LLM)
   APPROVED / BLOCKED / FLAGGED_FOR_REVIEW
        │
        ▼
 Execution               (real: email + logging · simulated: payment
                           completion, clearly labeled everywhere)
        │
        ▼
 Outcome observed ──► bounded reassessment loop ──► RECOVERED / STOPPED /
                                                      ESCALATED / EXPIRED
        │
        ▼
 Audit trail (every step, permanently recorded, fully explainable)
```

**Agent decides. Policy controls.** The agent (`app/agent.py`) can only
ever pick from a fixed six-action space (`app/enums.py::ActionType`) and
never executes anything itself. Every proposal passes through
`app/policy.py`, a deterministic control layer with zero dependency on the
LLM, before `app/execution.py` is allowed to act. This split is what makes
the system's safety properties auditable independently of the AI
component — see spec section 10 ("Agent decides. Policy controls.").

### Module map

| Module | Responsibility |
|---|---|
| `app/enums.py` | The bounded vocabulary: failure types, actions, decisions, policy results, statuses |
| `app/config.py` | All tunables, env-driven (`.env`) |
| `app/models.py` | SQLAlchemy ORM: cases, decisions, policy checks, executions, outcomes, audit log, eval runs |
| `app/schemas.py` | Pydantic request/response models |
| `app/classification.py` | Failure classification: deterministic map first, LLM/keyword fallback for free text |
| `app/agent.py` | TRACE decision engine — HEURISTIC (deterministic scoring) and LLM (real Groq API call) modes |
| `app/policy.py` | Deterministic policy & control layer |
| `app/execution.py` | Executes approved actions (real email, simulated payment outcomes) |
| `app/email_service.py` | Real SMTP send if configured, else clearly-labeled simulated send |
| `app/audit.py` | Append-only audit log helper |
| `app/idempotency.py` | Duplicate payment-event protection |
| `app/engine.py` | Orchestrates one full OBSERVE→...→STOP loop iteration; shared by the live API and batch eval |
| `app/baseline.py` | Static, non-contextual baseline workflow for comparison |
| `app/simulation/generator.py` | Synthetic dataset generator (seeded, reproducible) |
| `app/simulation/hidden_outcome_model.py` | Ground-truth recovery probabilities — **never imported by the agent** |
| `app/evaluation/runner.py` | Runs TRACE and the baseline over the same batch, with matched randomness |
| `app/evaluation/metrics.py` | Computes every metric in spec section 17 from persisted DB rows only |
| `app/routers/` | `cases.py`, `evaluation.py`, `dashboard.py` — the HTTP API |

---

## 2. Quickstart

```bash
cd trace_backend
pip install -r requirements.txt
cp .env.example .env        # edit if you want real SMTP / a real LLM key
python run.py                # or: uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs` for the interactive API docs.

Run the test suite (policy, classification, agent, idempotency,
evaluation, and full API integration tests):

```bash
pytest -v
```

Generate (or regenerate) the standalone synthetic dataset file:

```bash
python -m app.simulation.generator --n 500 --seed 42 --out data
```

This repo already ships with `data/synthetic_cases.json` and
`data/synthetic_cases.csv` — 500 reproducible synthetic recovery cases
(seed 42).

---

## 3. Agent modes

Set `AGENT_MODE` in `.env`:

- **`HEURISTIC`** (default) — a deterministic, explainable scoring engine.
  No network calls, instant, fully reproducible. This is what batch
  evaluation over hundreds of cases uses. It genuinely reasons per-case
  (transaction value × recovery probability given failure type, customer
  history, prior attempts, and engagement) — this is exactly the
  case-by-case reasoning the static baseline explicitly does *not* do.
- **`LLM`** — a real Groq API call (`GROQ_API_KEY` required)
  with structured JSON output, for the live/demo path. If the call fails
  or returns an invalid action, TRACE does **not** silently fall back to
  guessing or to the heuristic engine — per spec section 20, it surfaces
  as `FLAGGED_FOR_REVIEW` with confidence 0, and that is logged as an
  `AGENT_FALLBACK` audit event.

Both modes return the same `AgentDecisionResult` shape, so everything
downstream (policy, execution, audit, dashboard) is agent-mode-agnostic.

---

## 4. Real vs. simulated (never blurred)

| | Real | Simulated |
|---|---|---|
| Payment completion / failure | — | ✅ (hidden outcome model) |
| Recovered revenue | — | ✅ (always flagged `simulated: true`) |
| Email delivery | ✅ if SMTP configured | ✅ clearly-labeled fallback if not |
| Recovery-link click-through | ✅ via `/cases/{id}/click` | — |
| Policy evaluation | ✅ | — |
| Audit logging | ✅ | — |
| Agent LLM reasoning | ✅ (LLM mode) | — |

There is no real payment gateway integration and no real money movement
anywhere in this system (see spec section 27, "what not to build").

---

## 5. API

### Cases
- `POST /cases/ingest` — ingest a payment-failure event, classify it, and
  (by default) run the first DECIDE→POLICY→EXECUTE iteration.
- `POST /cases/{payment_id}/reassess` — trigger another bounded loop
  iteration for an open case.
- `POST /cases/{payment_id}/click` — simulate/record a real customer
  clicking a recovery link, resolving the pending simulated payment
  outcome.
- `GET /cases/{payment_id}` — full case detail: context, every decision,
  every policy check, every execution, every outcome, the complete audit
  trail.
- `GET /cases` — list/filter cases by status, system, source.

### Evaluation
- `POST /evaluation/run` — generate a fresh synthetic batch (default 300
  cases) and run **both** TRACE and the static baseline over it, with
  matched per-case randomness so differences reflect decisions, not luck.
  Persists an `EvaluationRun` + per-system `EvaluationResult`.
- `GET /evaluation/runs/{run_id}` — fetch a past run's results.
- `GET /evaluation/runs` — list recent runs.

### Dashboard
- `GET /dashboard/overview?system=TRACE` — headline metrics for a run.
- `GET /dashboard/failures?system=TRACE` — failures & revenue at risk by type.
- `GET /dashboard/decisions?system=TRACE` — actions selected, policy
  approved/blocked/flagged breakdown.
- `GET /dashboard/comparison` — **TRACE vs. static baseline**, the
  centerpiece comparison, across every metric in spec section 17.

All dashboard endpoints default to the most recent evaluation run if
`eval_run_id` isn't passed.

---

## 6. Safety properties, and where they live

- **Bounded action space** — `app/enums.py::ActionType`; the agent (and
  the policy layer) can only ever emit one of six fixed actions. An LLM
  response naming anything else is treated as a failed call, not executed.
- **Bounded reassessment loop** — `app/engine.py::run_to_completion` caps
  iterations at `MAX_REASSESSMENT_ITERATIONS` (default 4) and force-stops
  if that bound is hit rather than looping forever.
- **Attempt / window / repeat ceilings** — enforced in `app/policy.py`,
  independent of whatever the agent proposed:
  `MAX_RECOVERY_ATTEMPTS`, `RECOVERY_WINDOW_MINUTES`,
  `MAX_SAME_ACTION_REPEATS`.
- **Compliant escalation** — low agent confidence, or a first-attempt
  `STOP_RECOVERY` on a high-value transaction, is routed to
  `FLAGGED_FOR_REVIEW` rather than auto-closed.
- **LLM failure fallback** — classification failures fall back to
  `PROCESSING_ERROR` + low confidence (never a guessed specific category);
  agent reasoning failures fall back to `FLAGGED_FOR_REVIEW` (never a
  silently invented decision).
- **Idempotency** — one `RecoveryCase` per `payment_id`, enforced in
  `app/idempotency.py`; duplicate events are logged and never reprocessed.
- **Full audit trail** — every classification, decision, policy check,
  execution, outcome, and status change is appended to
  `AuditLogEntry`, queryable via `GET /cases/{payment_id}`.

---

## 7. Testing

```
tests/
  test_policy.py        — deterministic policy layer, all branches
  test_classification.py— deterministic + fallback classification paths
  test_agent.py          — heuristic engine behavior, bounded action space,
                            LLM-mode safe fallback with no API key
  test_idempotency.py    — duplicate event protection
  test_evaluation.py     — batch harness correctness, reproducibility,
                            attempt-ceiling safety check
  test_integration.py    — full API surface via FastAPI TestClient
```

40 tests, all passing. Each test uses an isolated temp SQLite file via
`tests/conftest.py`, so tests never share state.

---

## 8. Known simplifications (buildathon scope)

- SQLite, not Postgres — swap `DATABASE_URL` for any SQLAlchemy-supported
  DB with no code changes.
- No auth layer (explicitly out of scope per spec section 27).
- `HEURISTIC` agent mode is the default because it's free, instant, and
  reproducible for batch evaluation; wire a real `GROQ_API_KEY` and
  set `AGENT_MODE=LLM` to see the live-reasoning path.
- Recovery-link click-through in the live API is exposed as an explicit
  `/click` endpoint (standing in for a real webhook from an email/link
  provider) rather than a hosted checkout page.
