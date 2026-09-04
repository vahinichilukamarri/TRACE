import { useMemo, useState } from "react";
import { Cpu, Sparkles } from "lucide-react";

/*
 * Interactive routing explainer.
 *
 * The scoring and the four triggers below are ported from app/agent.py --
 * _ACTION_FIT verbatim, the probability/EV formula verbatim, and the triggers in
 * the same ORDER, because the backend returns the first one that fires and so
 * does this. If the port and the service ever disagree, that is a bug here.
 *
 * Two deliberate narrowings, since the widget exposes fewer controls than a real
 * case carries: the remaining-opportunities hard stop has no control (the other
 * hard stop, low classification confidence, does), and the excluded action is
 * taken to be the previous top pick rather than a separately tracked history.
 */

/* app/agent.py::_ACTION_FIT */
const ACTION_FIT = {
  BANK_TIMEOUT: {
    "Retry payment": 0.75,
    "Wait and reassess": 0.55,
    "Send recovery link": 0.45,
    "Suggest alternative method": 0.35,
  },
  CARD_DECLINED: {
    "Send recovery link": 0.55,
    "Suggest alternative method": 0.6,
    "Retry payment": 0.15,
    "Wait and reassess": 0.25,
  },
  INSUFFICIENT_FUNDS: {
    "Wait and reassess": 0.5,
    "Send recovery link": 0.4,
    "Suggest alternative method": 0.45,
    "Retry payment": 0.15,
  },
  AUTH_FAILURE: {
    "Send recovery link": 0.6,
    "Retry payment": 0.4,
    "Suggest alternative method": 0.35,
    "Wait and reassess": 0.2,
  },
  PROCESSING_ERROR: {
    "Retry payment": 0.35,
    "Wait and reassess": 0.35,
    "Send recovery link": 0.3,
    "Suggest alternative method": 0.25,
  },
};

const FAILURES = Object.keys(ACTION_FIT);
const FAILURE_LABEL = {
  BANK_TIMEOUT: "Bank timeout",
  CARD_DECLINED: "Card declined",
  INSUFFICIENT_FUNDS: "Insufficient funds",
  AUTH_FAILURE: "Auth failure",
  PROCESSING_ERROR: "Processing error",
};

/* Thresholds mirror app/config.py defaults. */
const MIN_CLASSIFICATION_CONFIDENCE = 0.6;
const EV_MARGIN_PCT = 0.05;
const HIGH_VALUE_THRESHOLD = 50000;
const HIGH_VALUE_MIN_ATTEMPTS = 1;
const HARD_STOP_CONFIDENCE = 0.35;

function scoreActions({ failure, amount, successRate, attempts, engagement, excluded }) {
  const fit = { ...ACTION_FIT[failure] };
  if (excluded) delete fit[excluded];
  if (engagement === "LINK_CLICKED") {
    fit["Suggest alternative method"] = (fit["Suggest alternative method"] ?? 0.3) + 0.2;
  }
  const discount = Math.max(0.3, 1 - 0.2 * attempts);
  return Object.entries(fit)
    .map(([action, base]) => {
      const p = Math.min(0.95, Math.max(0.02, base * (0.4 + 0.6 * successRate) * discount));
      return { action, probability: p, ev: amount * p };
    })
    .sort((a, b) => b.ev - a.ev);
}

/** Faithful port of _routing_reason, including trigger precedence. */
function route(input) {
  const { confidence, amount, attempts, engagement } = input;

  // Hard stops short-circuit before any trigger: safety rules, not judgement.
  if (confidence < HARD_STOP_CONFIDENCE) {
    return {
      engine: "Heuristic",
      trigger: null,
      headline: "Hard stop — never routed",
      detail:
        "Below 0.35 the heuristic stops reasoning and escalates to a person outright. The " +
        "router never sees the case — hard stops are safety rules, not judgement calls.",
      scored: [],
    };
  }

  // The loop excludes the action that just failed, so from the second attempt on
  // the candidate set is smaller — which is what moves the top-two gap. Here the
  // previous top pick stands in for "what was tried last".
  const first = scoreActions({ ...input, excluded: null });
  const excluded = attempts >= 1 ? first[0]?.action : null;
  const scored = scoreActions({ ...input, excluded });

  if (confidence < MIN_CLASSIFICATION_CONFIDENCE) {
    return {
      engine: "LLM",
      trigger: "Uncertain classification",
      headline: `Classification confidence ${confidence.toFixed(2)} is below ${MIN_CLASSIFICATION_CONFIDENCE.toFixed(2)}`,
      detail:
        "The action table is keyed on the failure type. If the type is itself a guess, the " +
        "table is standing on sand.",
      scored,
    };
  }

  const gap = scored.length >= 2 && scored[0].ev > 0
    ? (scored[0].ev - scored[1].ev) / scored[0].ev
    : 1;
  if (gap < EV_MARGIN_PCT) {
    return {
      engine: "LLM",
      trigger: "Top two too close",
      headline: `Top-two expected-value gap is ${(gap * 100).toFixed(0)}%, inside the ${(EV_MARGIN_PCT * 100).toFixed(0)}% margin`,
      detail:
        "The two best actions are separated by noise rather than signal, so the argmax is not " +
        "a real decision.",
      scored,
    };
  }

  if (amount >= HIGH_VALUE_THRESHOLD && attempts >= HIGH_VALUE_MIN_ATTEMPTS) {
    return {
      engine: "LLM",
      trigger: "Stakes justify deliberation",
      headline: `₹${amount.toLocaleString("en-IN")} with ${attempts} prior attempt${attempts === 1 ? "" : "s"}`,
      detail:
        "A call costs about ₹0.50. Being wrong here costs the transaction. Spend inference " +
        "where the expected cost of error exceeds the cost of thinking.",
      scored,
    };
  }

  if (attempts >= 1) {
    return {
      engine: "LLM",
      trigger: "History the table cannot hold",
      headline: `${attempts} prior attempt${attempts === 1 ? "" : "s"} failed — the fit table has no memory of it`,
      detail:
        "The table is keyed on failure type alone. It encodes nothing about what was already " +
        "tried, which is exactly where the heuristic is blind.",
      scored,
    };
  }

  if (engagement === "LINK_CLICKED") {
    return {
      engine: "LLM",
      trigger: "History the table cannot hold",
      headline: "The customer clicked the link and still did not pay",
      detail:
        "A genuine contradiction the fit table cannot represent: engagement happened, payment " +
        "did not.",
      scored,
    };
  }

  return {
    engine: "Heuristic",
    trigger: null,
    headline: "Heuristic sufficient",
    detail:
      "Confident classification, a clear winner among the candidates, ordinary stakes and no " +
      "history to account for. The deterministic answer stands on its own — no call, no cost.",
    scored,
  };
}

/* ------------------------------------------------------------------ controls */

function Slider({ id, label, value, min, max, step, onChange, display }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-console-text/85">
          {label}
        </label>
        <span className="tnum text-sm font-semibold text-console-text">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 h-6 w-full cursor-pointer accent-electric"
      />
    </div>
  );
}

function Choice({ label, options, value, onChange, name }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-console-text/85">{label}</legend>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              name={name}
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`rounded-xs border px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-electric bg-electric/20 text-cream"
                  : "border-console-line text-console-text/55 hover:border-console-text/40 hover:text-console-text"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------------------------------------------------------------------- page */

export function RoutingExplainer() {
  const [failure, setFailure] = useState("AUTH_FAILURE");
  const [amount, setAmount] = useState(7400);
  const [confidence, setConfidence] = useState(0.95);
  const [attempts, setAttempts] = useState(0);
  const [engagement, setEngagement] = useState("NONE");
  const [successRate] = useState(0.75);

  const result = useMemo(
    () => route({ failure, amount, confidence, attempts, engagement, successRate }),
    [failure, amount, confidence, attempts, engagement, successRate]
  );

  const isLLM = result.engine === "LLM";
  const maxEv = result.scored[0]?.ev || 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      {/* Controls */}
      <div className="space-y-6">
        <Choice
          label="Failure type"
          name="failure"
          value={failure}
          onChange={setFailure}
          options={FAILURES.map((f) => ({ value: f, label: FAILURE_LABEL[f] }))}
        />
        <Slider
          id="r-amount"
          label="Transaction amount"
          min={200}
          max={150000}
          step={200}
          value={amount}
          onChange={setAmount}
          display={`₹${amount.toLocaleString("en-IN")}`}
        />
        <Slider
          id="r-confidence"
          label="Classification confidence"
          min={0.2}
          max={1}
          step={0.01}
          value={confidence}
          onChange={setConfidence}
          display={confidence.toFixed(2)}
        />
        <Slider
          id="r-attempts"
          label="Prior failed attempts"
          min={0}
          max={3}
          step={1}
          value={attempts}
          onChange={setAttempts}
          display={String(attempts)}
        />
        <Choice
          label="Customer engagement"
          name="engagement"
          value={engagement}
          onChange={setEngagement}
          options={[
            { value: "NONE", label: "None" },
            { value: "LINK_SENT", label: "Link sent" },
            { value: "LINK_CLICKED", label: "Clicked, unpaid" },
          ]}
        />
      </div>

      {/* Verdict */}
      <div>
        <div
          className={`rounded-sm border p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] transition-colors duration-300 ${
            isLLM
              ? "border-hold/55 bg-gradient-to-br from-hold/25 via-hold/10 to-transparent"
              : "border-approve/50 bg-gradient-to-br from-approve/22 via-approve/8 to-transparent"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xs ${
                isLLM ? "bg-hold text-white" : "bg-approve text-white"
              }`}
            >
              {isLLM ? (
                <Sparkles className="h-4.5 w-4.5" strokeWidth={1.75} />
              ) : (
                <Cpu className="h-4.5 w-4.5" strokeWidth={1.75} />
              )}
            </span>
            <div>
              <div className="text-xs text-console-text/55">Decided by</div>
              <div className="text-lg font-semibold text-console-text">
                {result.engine}
                {isLLM ? " — a real reasoning call" : " — no call, no cost"}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-console-line pt-4">
            {result.trigger && (
              <div className="mb-1.5 text-sm font-semibold text-hold-soft">{result.trigger}</div>
            )}
            <p className="text-sm leading-relaxed text-console-text/85">{result.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-console-text/55">{result.detail}</p>
          </div>
        </div>

        {/* Live scoring, so the EV-gap trigger is visible rather than asserted. */}
        {result.scored.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs text-console-text/55">
                Candidate actions, scored by expected value
              </span>
              {attempts >= 1 && (
                <span className="text-xs text-console-text/40">
                  last failed action excluded
                </span>
              )}
            </div>
            <ul className="space-y-1.5">
              {result.scored.map((s, i) => (
                <li key={s.action} className="flex items-center gap-3">
                  <span className="w-[9.5rem] shrink-0 truncate text-sm text-console-text/75 sm:w-[13rem]">
                    {s.action}
                  </span>
                  <span className="relative h-5 flex-1 overflow-hidden rounded-xs bg-console-soft">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-xs transition-[width] duration-500 ease-out ${
                        i === 0
                          ? "bg-gradient-to-r from-approve to-approve-deep"
                          : "bg-console-line"
                      }`}
                      style={{ width: `${Math.max(2, (s.ev / maxEv) * 100)}%` }}
                    />
                  </span>
                  <span className="tnum w-20 shrink-0 text-right text-sm text-console-text/85">
                    ₹{Math.round(s.ev).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
