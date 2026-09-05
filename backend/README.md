# TRACE — Backend

**Razorpay AI Buildathon — Track 03: AI Revenue Recovery**

A complete, runnable FastAPI service backed by SQLite (Postgres in production) that
decides whether a failed payment is worth pursuing, selects and executes the most
appropriate next intervention, adapts after outcomes, and proves its value against a
static baseline workflow — with a deterministic policy layer, a full audit trail,
idempotent event handling, and a reproducible batch-evaluation harness.

Deployed at <https://trace-backend-4uu2.onrender.com> ([/docs](https://trace-backend-4uu2.onrender.com/docs)).

---

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [The orchestration loop](#2-the-orchestration-loop)
3. [The two engines, and ROUTED's four triggers](#3-the-two-engines-and-routeds-four-triggers)
4. [The policy & control layer](#4-the-policy--control-layer)
5. [The evaluation harness, and why it's force-deterministic](#5-the-evaluation-harness-and-why-its-force-deterministic)
6. [Startup auto-seed](#6-startup-auto-seed)
7. [API reference](#7-api-reference)
8. [Configuration](#8-configuration)
9. [Testing](#9-testing)
10. [What broke, and how we found it](#10-what-broke-and-how-we-found-it)
11. [Known simplifications](#11-known-simplifications)

---

## 1. Architecture at a glance

```
Payment failure event
        │
        ▼
 Idempotency check ──(duplicate)──► log + return existing case
        │ (new)
        ▼
 Failure classification  (deterministic code map, or LLM/keyword fallback
                           for free-text messages — never guesses)
        │
        ▼
 TRACE agent decision   (HEURISTIC / LLM / ROUTED — see §3)
   "Is recovery worth pursuing? What's the best next action?"
        │
        ▼
 Policy & control layer  (100% deterministic, independent of the agent)
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

**Agent decides. Policy controls.** The agent (`app/agent.py`) can only ever pick
from a fixed six-action space (`app/enums.py::ActionType`) and never executes
anything itself. Every proposal passes through `app/policy.py`, a deterministic
control layer with zero dependency on the agent, before `app/execution.py` is
allowed to act.

### Module map

| Module | Responsibility |
|---|---|
| `app/enums.py` | The bounded vocabulary: failure types, actions, decisions, policy results, statuses, agent modes |
| `app/config.py` | All tunables, env-driven (`.env`) |
| `app/models.py` | SQLAlchemy ORM: cases, decisions, policy checks, executions, outcomes, audit log, eval runs |
| `app/schemas.py` | Pydantic request/response models |
| `app/classification.py` | Failure classification: deterministic map first, LLM/keyword fallback for free text |
| `app/agent.py` | Decision engines — HEURISTIC, LLM, and the ROUTED dispatcher between them |
| `app/policy.py` | Deterministic policy & control layer |
| `app/execution.py` | Executes approved actions (real email, simulated payment outcomes) |
| `app/email_service.py` | Real SMTP send if configured, else clearly-labeled simulated send |
| `app/audit.py` | Append-only audit log helper |
| `app/idempotency.py` | Duplicate payment-event protection |
| `app/engine.py` | Orchestrates one full loop iteration; shared by the live API and batch eval |
| `app/baseline.py` | Static, non-contextual baseline workflow for comparison |
| `app/simulation/generator.py` | Synthetic dataset generator (seeded, reproducible) |
| `app/simulation/hidden_outcome_model.py` | Ground-truth recovery probabilities — **never imported by the agent** |
| `app/evaluation/runner.py` | Runs TRACE and the baseline over the same batch, with matched randomness |
| `app/evaluation/metrics.py` | Computes every metric from persisted DB rows only |
| `app/routers/` | `cases.py`, `evaluation.py`, `dashboard.py`, `policy_info.py` — the HTTP API |

---

## 2. The orchestration loop

`app/engine.py` owns this and is shared by **both** the live API and the batch
harness, so they cannot drift apart:

- **`run_iteration(db, case, rng, ...)`** — exactly one DECIDE → POLICY → EXECUTE
  step. Classifies (if not already classified), calls the agent, runs the policy
  check, executes the cleared action, and records everything.
- **`advance_case_state(case, action, outcome, rng)`** — moves the case's context
  forward after a completed iteration (elapsed time, spent attempts, decremented
  opportunities) so the *next* pass sees genuinely different state. This is what
  makes the loop converge instead of re-deciding an unchanged case forever — see
  [§10](#10-what-broke-and-how-we-found-it) for the bug this fixed.
- **`run_to_completion(db, case, rng, ...)`** — the batch loop: calls
  `run_iteration` then `advance_case_state` repeatedly until the case reaches a
  terminal status or `MAX_REASSESSMENT_ITERATIONS` is hit, then force-executes
  `STOP_RECOVERY` rather than allow an unbounded loop.

The live route `POST /cases/{id}/reassess` calls the exact same `run_iteration` +
`advance_case_state` pair, bounded by the same `MAX_REASSESSMENT_ITERATIONS`, so a
live case converges exactly like a batch one — one HTTP call per iteration instead of
driving the whole loop server-side.

---

## 3. The two engines, and ROUTED's four triggers

Three values for `AGENT_MODE`, selected in `app/agent.py::decide()`:

### `HEURISTIC`

Deterministic, explainable, no network calls, fully reproducible. For each failure
type it holds a table of base "fit" weights per action, then scores candidates:

```
probability = base_fit
            × (0.4 + 0.6 × customer_success_rate)     # customer history
            × max(0.3, 1 − 0.2 × previous_attempts)   # diminishing returns
            clamped to [0.02, 0.95]

expected_value = amount × probability
```

It picks the highest-expected-value action, excluding one just tried and failed. It
hard-stops when there are no opportunities left or classification confidence is
below 0.35, stops when expected value no longer justifies the effort, and escalates
high-value transactions after a failed attempt rather than continuing to automate.
This **is** a genuine contextual decision engine — reasoning per case about value,
history, failure type, and prior attempts — which is exactly what the static
baseline does not do. This is what the 300-case benchmark always uses.

### `LLM`

A real Groq call (`GROQ_API_KEY` required) returning structured JSON, constrained to
the same six-action vocabulary. Bounded end-to-end (`LLM_CALL_MAX_WALL_CLOCK_SECONDS`,
default 15s) so a slow or retrying API call can never stall a request or hold a
database transaction open. If the call fails, TRACE does **not** silently fall back
to the heuristic engine or guess — it surfaces `ESCALATE_FOR_REVIEW` with a decision
of `EVALUATION_UNAVAILABLE` (never `NOT_WORTH_PURSUING` — see [§10](#10-what-broke-and-how-we-found-it)).
A 429 rate limit gets its own bounded retry (`LLM_RATE_LIMIT_MAX_RETRIES`, backoff
`LLM_RATE_LIMIT_BACKOFF_SECONDS × LLM_RATE_LIMIT_BACKOFF_MULTIPLIER^attempt`) — the
only error class worth retrying, since everything else is deterministic. Both engines
attach the same `expected_value` / `intervention_cost` / `net_expected_value` fields,
computed by a single shared `_estimate_probability()` function regardless of which
engine decided, so "expected value" is auditable rather than just another model
output.

### `ROUTED` — per-case dispatch between the two

The deployed live path. The heuristic runs on **every** case (free, instant); the LLM
is only called when one of four signals says the heuristic's answer isn't trustworthy
enough to stand on its own. `agent_mode` persisted on the resulting decision is always
the engine that *actually* decided (`HEURISTIC` or `LLM`) — `ROUTED` is a dispatch
mode, never a result.

| # | Trigger | Current threshold | Why |
|---|---|---|---|
| 1 | Uncertain classification | `classification_confidence < LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE` (**0.6**) | The heuristic picks from a table keyed on `failure_type`; if the type itself is a guess, the table is standing on sand. |
| 2 | Top-two candidates too close to call | gap `< LLM_ROUTE_EV_MARGIN_PCT` (**5%**) | Below this margin the argmax is separating noise, not signal. Kept tight deliberately — at 10% this degenerated into a per-failure-type lookup (91% of CARD_DECLINED, 0% of BANK_TIMEOUT) instead of a per-case signal. |
| 3 | Stakes justify deliberation | `amount >= HIGH_VALUE_THRESHOLD` (**₹50,000**) and `previous_recovery_attempts >= LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS` (**1**) | An LLM call costs about ₹0.50; a wrong call on a high-value transaction costs the transaction. |
| 4 | History the fit table can't represent | a failed prior attempt, or `LINK_CLICKED` engagement with the case still unrecovered (gated by `LLM_ROUTE_ON_PRIOR_EVIDENCE`, **on** by default) | `_ACTION_FIT` is keyed on `failure_type` alone — it has no slot for "we already tried this and it failed" or "they clicked and still didn't pay". Exactly where the heuristic is reasoning from a table that has forgotten the case's own history. |

Hard stops (no opportunities left, or classification confidence too low to act on at
all) short-circuit before any of these four checks — they're safety rules, not
judgment calls, and there's nothing an LLM can add to them. With no `GROQ_API_KEY`
configured, a case that would route keeps the heuristic answer instead of escalating
to a human — routing means "would benefit from an LLM," not "requires one," so a
fresh clone with no key is still a fully working app.

---

## 4. The policy & control layer

`app/policy.py` is 100% deterministic with zero dependency on the agent. It would
behave identically no matter what produced the proposed action — which is what makes
TRACE's safety properties verifiable independently of the AI.

| # | Rule | Result |
|---|---|---|
| 1 | Case already `RECOVERED` | BLOCKED |
| 2 | Case already `STOPPED` / `EXPIRED` | BLOCKED |
| 3 | Recovery window expired | BLOCKED → forced `STOP_RECOVERY` |
| 4 | `previous_recovery_attempts >= MAX_RECOVERY_ATTEMPTS` (**3**) | BLOCKED → forced `STOP_RECOVERY` |
| 5 | No remaining recovery opportunities | BLOCKED → forced `STOP_RECOVERY` |
| 6 | Same action repeated beyond `MAX_SAME_ACTION_REPEATS` (**1**) | BLOCKED → `ESCALATE_FOR_REVIEW` |
| 7 | Agent confidence below `POLICY_MIN_CONFIDENCE` (**0.4**) | FLAGGED_FOR_REVIEW |
| 8 | High-value (**≥₹50,000**) transaction stopped on the very first attempt | FLAGGED_FOR_REVIEW |
| 9 | Everything passed | APPROVED |

### Per-failure-type recovery windows

The window in rule 3 is not flat:

| Failure type | Window | Why |
|---|---|---|
| `BANK_TIMEOUT` | **60 min** (`RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT`) | NPCI mandates auto-reversal of most failed UPI transactions within ~60 minutes. Past that the money is already back with the customer, so continued automated recovery is moot. |
| everything else | **4320 min** (3 days, `RECOVERY_WINDOW_MINUTES`) | No equivalent regulatory auto-reversal. |

Both values, plus every rule description, intervention cost, and the current
`llm_routing` configuration, are served live from `GET /policy/config` so the UI never
hard-codes a copy that could drift.

---

## 5. The evaluation harness, and why it's force-deterministic

`POST /evaluation/run` generates N synthetic failed payments (`app/simulation/generator.py`)
and runs the **same dataset** through both systems with **matched per-case RNG
seeds**, so differences in outcome are driven by the decisions made, not by lucky
draws:

- **TRACE** — full contextual agent + policy + bounded reassessment loop.
- **BASELINE** (`app/baseline.py`) — one fixed `failure_type → action` mapping,
  executed exactly once, with no awareness of value, history, or engagement, and no
  policy layer at all. The "retry → wait → remind → stop" pattern TRACE improves on.

A **hidden outcome model** (`app/simulation/hidden_outcome_model.py`) decides whether
an action actually recovers the payment. The agent never imports it — it has to infer
what works from context alone, the same way a real system would.

**The batch harness is hard-locked to `HEURISTIC` and can never make a network call**,
regardless of what `AGENT_MODE` is set to in the environment:

```python
if agent_mode is None:
    agent_mode = AgentMode.HEURISTIC.value
elif agent_mode.upper() == AgentMode.ROUTED.value:
    logger.warning("run_evaluation() was passed agent_mode=ROUTED; coercing to HEURISTIC. "
                    "Batch evaluation must stay deterministic and offline.")
    agent_mode = AgentMode.HEURISTIC.value
```

`agent_mode=None` — not just an explicit `"ROUTED"` — is the dangerous case: it's
what `POST /evaluation/run` always passes, and it used to fall through all the way to
`settings.AGENT_MODE`. With `AGENT_MODE=ROUTED` set in the environment (the deployed
default), that silently turned every 300-case benchmark into hundreds of live, billed,
non-reproducible LLM calls — the exact guarantee this harness exists to protect. See
[§10](#10-what-broke-and-how-we-found-it) for how this was found.

Two other guarantees:

- **Serialized.** SQLite allows one writer; a second concurrent run gets a clean
  `409` instead of racing and corrupting the first.
- **No mail.** Batch cases never carry a real `customer_email` (unless `demo_email` /
  `demo_email_count` deliberately route the first few TRACE cases to a real inbox for
  a live demo), so a 300-case run never sends real mail and never pays SMTP's ~1.5s
  network cost per send inside an open DB transaction.

Omit `seed` and the API picks a fresh random one — "Run new evaluation" produces a
genuinely new batch, not a silent replay.

---

## 6. Startup auto-seed

A freshly deployed instance has an empty database, so every dashboard endpoint 404s
and the app opens looking broken. `seed_initial_evaluation()` (`app/main.py`) runs
once on boot: if no *completed* evaluation run exists yet (one whose
`EvaluationResult` rows are actually written — a bare `EvaluationRun` row can be a
crashed half-batch, which must not suppress seeding), it runs one `HEURISTIC`,
`SIMULATION_SEED`-seeded, `AUTO_SEED_SIZE`-case (default 300) evaluation.
**`HEURISTIC` is forced here too**, never inherited from `AGENT_MODE` — an
LLM/ROUTED-mode deployment would otherwise fire hundreds of API calls during boot and
hang startup. The seed shares the same lock the API route uses (`EVAL_RUN_LOCK`), so
a request arriving mid-boot can't race it, and it never raises: a failed seed degrades
to an empty dashboard rather than crashing the service. Set
`AUTO_SEED_ON_STARTUP=false` to skip it (e.g. local development where you don't want
the wait).

---

## 7. API reference

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
| `GET` | `/dashboard/decisions` | Action + policy-result distribution, plus the live-scoped `llm_routed_pct` |
| `GET` | `/dashboard/comparison` | TRACE vs BASELINE, same batch |
| `GET` | `/dashboard/frontier` | Recovery-efficiency frontier curves |

All dashboard endpoints accept `?eval_run_id=`; omitted, they resolve to the latest
*completed* run.

### Policy

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/policy/config` | Live thresholds, routing config, per-failure-type windows, intervention costs, and every rule description |

---

## 8. Configuration

All settings live in `app/config.py` and are overridable via `backend/.env`
(`backend/.env.example` documents every default).

| Setting | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./trace.db` | Database connection (Postgres in production) |
| `AGENT_MODE` | `HEURISTIC` | `HEURISTIC` \| `LLM` \| `ROUTED` |
| `GROQ_API_KEY` / `GROQ_MODEL` | — / `openai/gpt-oss-120b` | Live LLM path (classification + decisions) |
| `AGENT_MIN_CONFIDENCE` | `0.5` | Agent's own confidence floor |
| `LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE` | `0.6` | ROUTED trigger 1 |
| `LLM_ROUTE_EV_MARGIN_PCT` | `0.05` | ROUTED trigger 2 |
| `LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS` | `1` | ROUTED trigger 3 (paired with `HIGH_VALUE_THRESHOLD`) |
| `LLM_ROUTE_ON_PRIOR_EVIDENCE` | `true` | ROUTED trigger 4 on/off |
| `LLM_RATE_LIMIT_MAX_RETRIES` | `2` | 429-only bounded retries |
| `LLM_RATE_LIMIT_BACKOFF_SECONDS` / `_MULTIPLIER` | `0.5` / `3.0` | Backoff between retries |
| `LLM_CALL_MAX_WALL_CLOCK_SECONDS` | `15.0` | Hard ceiling on one decision call, retries included |
| `MAX_RECOVERY_ATTEMPTS` | `3` | Hard attempt ceiling |
| `RECOVERY_WINDOW_MINUTES` | `4320` | Default recovery window (3 days) |
| `RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT` | `60` | NPCI auto-reversal window |
| `MAX_SAME_ACTION_REPEATS` | `1` | Never hammer one action |
| `HIGH_VALUE_THRESHOLD` | `50000` | ₹ threshold for extra human oversight |
| `POLICY_MIN_CONFIDENCE` | `0.4` | Below this → human review |
| `MAX_REASSESSMENT_ITERATIONS` | `4` | Hard bound on the autonomous loop |
| `SMTP_*` | — | Real email; leave blank for simulated sends |
| `SMTP_TIMEOUT_SECONDS` | `15` | Never let a hung SMTP call stall a request |
| `SIMULATION_SEED` | `42` | Default seed for direct/programmatic runs |
| `DEFAULT_BATCH_SIZE` | `300` | Default dataset size |
| `AUTO_SEED_ON_STARTUP` / `AUTO_SEED_SIZE` | `true` / `300` | Boot-time seed (§6) |
| `CORS_ORIGINS` | deployed frontend | Comma-separated allowlist |

Frontend: `frontend/.env` → `VITE_API_BASE_URL` (default `http://localhost:8000`).

---

## 9. Testing

```bash
cd backend && pytest -q
```

**76 tests, ~30s.**

| File | Covers |
|---|---|
| `test_agent.py` | Heuristic decision quality, bounded action space, safe LLM fallback |
| `test_routing.py` | All four ROUTED triggers individually, hard-stop short-circuiting, the missing-key degrade path, and that a ROUTED batch matches a HEURISTIC batch exactly |
| `test_policy.py` | Every guardrail rule independently |
| `test_classification.py` | Structured codes, keyword fallback, never-guess behavior (pinned `allow_llm=False`) |
| `test_idempotency.py` | Duplicate events never double-process |
| `test_evaluation.py` | Both systems produce metrics; same seed reproduces; attempt bounds hold; BANK_TIMEOUT domain consistency (§10) |
| `test_integration.py` | Full API surface, including live reassessment convergence (§10) |

An autouse `conftest.py` fixture pins `AGENT_MODE=HEURISTIC` for the whole suite —
without it, a developer running locally with `ROUTED` and a real key would have the
suite make live, billed, non-deterministic calls (observed: ~21s → minutes).

Frontend:

```bash
cd frontend && npm run build && npm run lint
```

---

## 10. What broke, and how we found it

Three bugs worth documenting as engineering evidence, not just fixed and forgotten.

### The reassess-loop convergence bug

The batch harness always converged: `run_to_completion` calls `run_iteration` then
`advance_case_state` in a loop, so every pass sees a case that's genuinely older or
has one more spent attempt. The **live** `/cases/{id}/reassess` route only called
`run_iteration` — it executed a real decision and a real policy check, but never
advanced the case's context afterward. A live case could be reassessed forever
against a frozen `time_since_failure_minutes` and `previous_recovery_attempts`,
never reaching a terminal state, because nothing about its situation ever looked
different to the agent on the next call.

Fixed by pulling the state-advance logic out of the batch loop into a standalone
`advance_case_state()` ([`app/engine.py`](app/engine.py)), calling it from **both**
`run_to_completion` and the live route, and adding the same
`MAX_REASSESSMENT_ITERATIONS` bound to the live route so it force-stops instead of
looping indefinitely. A regression test (`test_live_reassess_converges_and_advances_state`)
asserts the case's observed state actually changes between calls and that it reaches
a terminal status within the bound — the actual bug was that it didn't.

### The benchmark-vs-simulator BANK_TIMEOUT contradiction

`app/policy.py` gives BANK_TIMEOUT a 60-minute recovery window, on the premise that
NPCI auto-reverses most failed UPI transactions by then. But `time_since_failure_minutes`
was originally sampled from the same flat 5-2880 minute distribution for every
failure type — which put roughly 98% of the BANK_TIMEOUT bucket already past the
60-minute window before TRACE ever saw it. TRACE's policy layer correctly refused to
act on those. The static baseline, which has no policy layer at all, kept "recovering"
them anyway — because the **hidden outcome model** (the ground truth both systems are
graded against) had no idea the window existed either, and happily handed out
recoveries on transactions the domain rule said were already reversed. The benchmark
was contradicting its own premise: crediting the policy-free baseline for successes
on money that, per TRACE's own guardrail, should have been un-recoverable by anyone.

Fixed two ways, in `app/simulation/generator.py` and `hidden_outcome_model.py`:

1. `_sample_time_since_failure()` makes BANK_TIMEOUT age **bimodal** —
   `BANK_TIMEOUT_FRESH_SHARE` (55%) of cases land genuinely inside the window (a
   real "act now or lose it" decision), the rest land clearly past it.
2. `hidden_outcome_model.resolve()` now enforces the same window as ground truth: any
   BANK_TIMEOUT case past `RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT` returns
   `(False, 0.0)` for *any* action, by *either* system — reading the same config
   value the policy layer uses, so the two can never drift apart again.

Regression tests assert both directions: no system ever recovers a past-window
BANK_TIMEOUT case end-to-end (`test_no_system_recovers_a_past_window_bank_timeout_end_to_end`),
and the bucket isn't made trivially dead in the other direction
(`test_bank_timeout_bucket_is_not_trivially_dead`).

### Three real bugs, found once a live Groq key was actually used

Everything up to this point had tested the *decision to route* — the LLM path itself
had never actually executed end to end. Running it with a real key surfaced three
bugs that no amount of testing the router in isolation would have caught:

1. **Silent rate-limit fallback.** `_llm_decide()`'s exception handling was a bare
   `except: return None` — a transient 429 (rate-limit back-pressure, saying nothing
   about the case) was caught by the exact same path as a genuine reasoning failure,
   produced the same undifferentiated "reasoning call failed" fallback message, and
   wasn't even logged. The audit trail had no way to tell an overloaded API from a
   model that was asked and couldn't answer. Fixed with a narrow `_is_rate_limit()`
   check, a bounded 429-only retry with exponential backoff (every other error class
   is deterministic, so retrying it only delays the fallback and burns quota), a
   `RATE_LIMITED` sentinel distinct from a plain failure, and a `fallback_cause`
   field (`RATE_LIMITED` vs `REASONING_FAILURE`) so the audit trail states honestly
   which one actually happened.
2. **The classifier had a 100% failure rate.** `LLM_CLASSIFY_MAX_TOKENS` was `100`,
   but `GROQ_MODEL` defaults to a *reasoning* model whose internal chain-of-thought
   tokens are billed against `max_tokens` before any visible content is emitted.
   Observed live: `finish_reason='length'`, 0 characters of content, 507 characters
   of reasoning — the budget was exhausted by thinking alone, every single time.
   Every free-text classification silently fell through to keyword matching, and
   ROUTED trigger 1 ("uncertain classification") was never structurally unreachable
   as one might assume from clean test fixtures — it was just broken. Raised to 800
   (and `LLM_DECIDE_MAX_TOKENS` similarly, 400 → 1500, after the same failure mode
   showed up on the decision call: observed usage sits around 410-430 tokens).
3. **The fallback claimed a judgment it never made.** When the LLM call failed for
   any reason, the old fallback reported `decision=NOT_WORTH_PURSUING` — a
   substantive claim that TRACE evaluated the case and concluded it wasn't worth
   pursuing. But the reasoning call never completed; no judgment was formed at all.
   Reporting a network timeout on a ₹95,000 case as "not worth pursuing" would have
   the system claim a conclusion it never reached. Fixed by adding
   `DecisionType.EVALUATION_UNAVAILABLE` — reserved exclusively for a failed
   reasoning call, and a value only TRACE's own fallback path may ever set; if the
   LLM's JSON response tries to claim it for itself, that response is rejected
   outright (`test_llm_may_not_self_report_evaluation_unavailable`).

All three are covered by regression tests in `test_agent.py` and `test_routing.py`
that exercise the actual failure paths (fake rate-limited/malformed Groq responses)
rather than only the routing decision that leads to them.

---

## 11. Known simplifications

- SQLite locally, Postgres in production — swap `DATABASE_URL` for any
  SQLAlchemy-supported DB with no code changes (`_normalize_db_url` handles Render's
  `postgres://` vs SQLAlchemy's required `postgresql://`).
- No auth layer.
- `HEURISTIC` is the safest default for a fresh clone (free, instant, reproducible);
  the deployed instance runs `ROUTED` with a real `GROQ_API_KEY`.
- Recovery-link click-through in the live API is an explicit `/click` endpoint
  (standing in for a real webhook from an email/link provider) rather than a hosted
  checkout page.
