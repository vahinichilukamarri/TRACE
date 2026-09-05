# TRACE — Transaction Recovery Agent with Contextual Evaluation

**Razorpay AI Buildathon — Track 03: AI Revenue Recovery**

**[Live app →](https://trace-xi-nine.vercel.app)** · Backend API: [trace-backend-4uu2.onrender.com](https://trace-backend-4uu2.onrender.com)

A failed payment is not a lost customer — most of the time the person still wants to
buy. TRACE is a bounded AI agent that looks at a failed transaction, decides whether
recovering it is actually worth the effort, picks the single best next action,
executes it, watches what happens, adapts, and knows when to stop. Everything it
proposes passes through a deterministic policy layer that can override it before
anything executes, and every step is written to an immutable audit trail.

To prove it isn't just a good idea, TRACE runs the same 300 synthetic failed payments
through itself and through a static "retry → wait → remind → stop" baseline, on
identical data, and reports the difference.

---

## Table of contents

1. [The core thesis](#1-the-core-thesis)
2. [Agent decides. Policy controls.](#2-agent-decides-policy-controls)
3. [Dual-engine design: deterministic benchmark, routed live path](#3-dual-engine-design-deterministic-benchmark-routed-live-path)
4. [The bounded action space](#4-the-bounded-action-space)
5. [Deployed](#5-deployed)
6. [Quickstart](#6-quickstart)
7. [Measured results](#7-measured-results)
8. [Razorpay Track 03 alignment](#8-razorpay-track-03-alignment)
9. [Known limitations](#9-known-limitations)

---

## 1. The core thesis

It would be easy to assume TRACE wins by trying less. It doesn't — on the 300-case
benchmark it takes **more** recovery actions than the baseline (310 vs 249). The
thesis isn't attempt count, it's **where the effort goes**:

| | TRACE | BASELINE |
|---|---|---|
| Cases correctly never pursued at all | **98** | 43 |
| Recovery value per intervention | **₹873.42** | ₹766.20 |

TRACE spends more of its 310 actions on cases actually worth chasing, and declines to
touch **98 of 300** cases up front — more than double the baseline's 43 — because a
contextual read of value, history, and failure type says the expected return doesn't
justify the cost. A dumb workflow chases a ₹200 transaction with four prior failures
exactly as hard as it chases a ₹95,000 transaction that has never failed before.
TRACE doesn't. The clearest evidence of judgment is the work correctly left undone,
not the total number of things attempted. Full numbers: [§7](#7-measured-results).

## 2. Agent decides. Policy controls.

The agent (`app/agent.py`) can only ever pick from a fixed six-action space
(`app/enums.py::ActionType`) and never executes anything itself. Every proposal
passes through `app/policy.py` — a **9-rule, 100% deterministic control layer with
zero dependency on the LLM or the heuristic engine** — before `app/execution.py` is
allowed to act. Confidence too low, a high-value transaction proposed for closure on
the first attempt, an expired recovery window, an attempt ceiling: the policy layer
catches all of it regardless of which engine made the proposal. That separation is
what makes TRACE's safety properties auditable independently of the AI component. The
full 9-rule table, with current thresholds, is in [backend/README.md](backend/README.md#4-the-policy--control-layer).

## 3. Dual-engine design: deterministic benchmark, routed live path

TRACE has two decision engines behind one interface — a deterministic `HEURISTIC`
scorer and a real LLM call (`Groq`) — plus a `ROUTED` dispatch mode that runs the
heuristic on every case (free, instant) and escalates to the LLM only when one of four
signals says the heuristic's answer isn't trustworthy enough on its own: an uncertain
failure classification, a top-two candidate action too close to call, a high-value
transaction with a failed prior attempt, or case history the heuristic's fit table
structurally can't represent. Full trigger definitions and thresholds are in
[backend/README.md](backend/README.md#3-the-two-engines-and-routeds-four-triggers).

**The 300-case benchmark is deliberately locked to `HEURISTIC` and never touches the
network** — that's the only way a byte-reproducible comparison against the baseline is
possible, and a batch run that fired hundreds of live LLM calls would be slow, billed,
and non-reproducible by construction. **The deployed live path runs `ROUTED`** — every
individually ingested case gets a per-case decision on whether it needs real
reasoning, which is where the routing behaviour and the LLM's actual answers become
visible in the demo. See [backend/README.md §5](backend/README.md#5-the-evaluation-harness-and-why-its-force-deterministic)
for the specific bug this distinction had to survive.

## 4. The bounded action space

| Action | Meaning | Direct recovery? |
|---|---|---|
| `RETRY_PAYMENT` | Re-attempt the charge | yes |
| `SEND_RECOVERY_LINK` | Email a payment link | yes |
| `SUGGEST_ALTERNATIVE_METHOD` | Email suggesting another method | yes |
| `WAIT_AND_REASSESS` | Do nothing now; re-evaluate later | no |
| `ESCALATE_FOR_REVIEW` | Route to a human | no |
| `STOP_RECOVERY` | Give up, close the case | no |

Nothing else exists. TRACE cannot invent an action, change an amount, move real
money, or contact a customer outside these six paths — the worst case is bounded by
construction, not by hoping the model behaves.

## 5. Deployed

| | URL |
|---|---|
| Frontend (Vercel) | <https://trace-xi-nine.vercel.app> |
| Backend API (Render) | <https://trace-backend-4uu2.onrender.com> |
| API docs | <https://trace-backend-4uu2.onrender.com/docs> |

A fresh deploy auto-seeds one HEURISTIC, seed-42, 300-case evaluation run on boot, so
the dashboard opens on real populated data instead of a wall of 404s. Render's free
tier spins the backend down when idle — the first request after a quiet period can
take 20-30s to wake it up.

## 6. Quickstart

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # edit for real SMTP / a real Groq key
python run.py                  # or: uvicorn app.main:app --reload
```

Interactive API docs: <http://localhost:8000/docs>. SQLite (`backend/trace.db`) is
created automatically on first start.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env           # set VITE_API_BASE_URL if the backend isn't on :8000
npm run dev
```

Opens on <http://localhost:5173>.

### First run

1. Open the app and read the landing page's seven-card argument, or jump straight to
   **/dashboard**.
2. **Recovery Cases → Simulate failed payment** to push one live case through the
   full loop and land on its Case Investigation view — pick a demo preset to reliably
   exercise a specific behaviour (routing to the LLM, an expired BANK_TIMEOUT, etc.).
3. **Performance** for the TRACE-vs-baseline comparison and efficiency frontier.
4. **Policy & Control** to see every guardrail and threshold read live from the
   running backend.

## 7. Measured results

300 synthetic failed payments, seed 42, run through TRACE (`HEURISTIC`, the mode the
benchmark is locked to) and the static baseline on identical data. Freshly re-run for
this document — reproduce it yourself with `POST /evaluation/run {"seed": 42}` (see
[backend/README.md §5](backend/README.md#5-the-evaluation-harness-and-why-its-force-deterministic)).

| Metric | BASELINE | TRACE |
|---|---|---|
| Total failed payments | 300 | 300 |
| Revenue at risk | ₹10,08,761.21 | ₹10,08,761.21 |
| Recovery actions taken | 249 | 310 |
| Transactions recovered | 61 | 75 |
| Revenue recovered *(simulated)* | ₹1,90,784.18 | ₹2,70,759.09 |
| Recovery rate | 20.33% | 25.00% |
| Unnecessary interventions | 188 | 212 |
| Interventions avoided | 43 | **98** |
| Cases stopped | 239 | 220 |
| Cases escalated | 0 | 5 |
| Policy-blocked actions | 0 | 71 |
| **Recovery value per intervention** | ₹766.20 | **₹873.42** |

TRACE recovers 42% more revenue, at a recovery rate 23% higher (relative), from the
identical pot of failed payments — while declining more than twice as many cases up
front. See [§9](#9-known-limitations) for the one bucket (BANK_TIMEOUT) where the
baseline still edges it, and why.

## 8. Razorpay Track 03 alignment

Track 03 asks for an AI agent that decides whether a failed payment is worth pursuing,
takes the appropriate next action, and demonstrates measurable value over a naive
approach — with the judgment auditable, not just trusted. TRACE's pieces map directly:
a bounded, priced action space instead of free-form generation; an expected-value
economics layer (`expected_value` / `intervention_cost` / `net_expected_value`) that
makes "worth pursuing" a number, not a vibe; a deterministic policy layer that can
overrule the AI and is independently testable; a full audit trail so any case's
decision can be reconstructed after the fact; and a same-data, same-seed comparison
against a static baseline so "TRACE is better" is a measured claim rather than a
marketing one.

## 9. Known limitations

- **No real payment gateway.** Payment completion is simulated by a hidden outcome
  model the agent never sees. Every simulated value is labeled as such throughout the
  API and UI.
- **The BANK_TIMEOUT bucket is the one place the baseline still edges TRACE.** Of 98
  BANK_TIMEOUT cases in the seed-42 benchmark, BASELINE recovers 28 (₹95,558.89) vs
  TRACE's 25 (₹74,051.39). The baseline retries every case immediately with no
  awareness of the 60-minute NPCI auto-reversal window; TRACE sometimes picks
  `WAIT_AND_REASSESS` first on a case that was still fresh, and the resulting time
  jump can age it past that window before its next reassessment pass — at which point
  its own policy layer correctly force-stops it. TRACE's deliberation costs it a
  narrow, honest loss in exactly the bucket where hesitation is expensive. Left as an
  observed property of the current heuristic ordering, not patched to force a win.
- **`POST /cases/{id}/click` is not idempotent.** Repeated calls append additional
  outcome rows. The UI guards against this; the endpoint itself doesn't.
- **Single-writer assumption locally.** SQLite (local dev) allows one writer; a
  concurrent `POST /evaluation/run` gets a clean `409` rather than racing. The
  deployed backend runs Postgres.
- **No authentication.** CORS is scoped to the deployed frontend; every endpoint is
  otherwise unauthenticated.

Backend internals, the orchestration loop, the four routing triggers, and three real
bugs found once a live LLM key was exercised: [backend/README.md](backend/README.md).
Frontend design system and page tour: [frontend/README.md](frontend/README.md).
