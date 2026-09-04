import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { usePrefersReducedMotion } from "./useInView";

/*
 * The hero: a machine's proposal meeting a deterministic policy layer.
 *
 * All three verdicts are REAL adjudications pulled from the running system, not
 * illustrations. The blocked one is the single repeat-limit block in 7,215
 * recorded policy checks — the LLM claimed a recovery link "has not yet been
 * used" when it had been sent twice, and the rule caught it.
 *
 * Motion budget is spent here and nowhere else on the page.
 */

const VERDICTS = [
  {
    key: "blocked",
    verdict: "BLOCKED",
    label: "Blocked",
    tone: "block",
    caseId: "EV_DEMO_01",
    amount: "₹7,400",
    failure: "Auth failure",
    meta: "Live case, iteration 4",
    engine: "LLM",
    confidence: "0.85",
    proposed: "Send recovery link",
    reasoning:
      "The transaction is moderate value and the customer has a decent success rate. " +
      "One automated recovery opportunity remains, and a recovery link has not yet been " +
      "used as an action, making it the best next step.",
    checks: [
      { rule: "Case already recovered", pass: true },
      { rule: "Recovery window still open", pass: true },
      { rule: "Attempts under the ceiling", pass: true },
      {
        rule: "Same action already attempted 2 times — repeat limit (1) exceeded",
        pass: false,
      },
    ],
    executed: "Escalate for review",
    note: "The proposal was confident and wrong. The link had already been sent twice; the model asserted it had not been used at all.",
  },
  {
    key: "approved",
    verdict: "APPROVED",
    label: "Approved",
    tone: "approve",
    caseId: "llm_live_01",
    amount: "₹7,400",
    failure: "Auth failure",
    meta: "Live case, iteration 2",
    engine: "LLM",
    confidence: "0.86",
    proposed: "Retry payment",
    reasoning:
      "The transaction is moderate value with a good customer success rate and two " +
      "recovery attempts left. An auth failure often succeeds on a retry, and the prior " +
      "link method failed, so a direct retry is the most promising next automated step.",
    checks: [
      { rule: "Case already recovered", pass: true },
      { rule: "Recovery window still open", pass: true },
      { rule: "Attempts under the ceiling", pass: true },
      { rule: "All nine checks passed", pass: true },
    ],
    executed: "Retry payment",
    note: "Policy cleared it unchanged. Most proposals pass — the layer is a filter, not a brake.",
  },
  {
    key: "held",
    verdict: "FLAGGED FOR REVIEW",
    label: "Escalated",
    tone: "hold",
    caseId: "PAY-CARD-6108",
    amount: "₹92,000",
    failure: "Card declined",
    meta: "Live case, iteration 1",
    engine: "Heuristic",
    confidence: "0.95",
    proposed: "Stop recovery",
    reasoning: "No remaining recovery opportunities for this transaction.",
    checks: [
      { rule: "Case already recovered", pass: true },
      { rule: "Recovery window still open", pass: true },
      {
        rule: "High-value transaction stopped on the first attempt requires human review",
        pass: false,
      },
    ],
    executed: "Escalate for review",
    note: "The agent was probably right to stop. At ₹92,000 the policy layer still wants a person to confirm it.",
  },
];

const TONE = {
  approve: {
    text: "text-approve",
    stamp: "bg-gradient-to-br from-approve to-approve-deep",
    fill: "bg-approve-soft",
    ring: "border-approve/35",
    dot: "bg-approve",
  },
  block: {
    text: "text-block",
    stamp: "bg-gradient-to-br from-block to-block-deep",
    fill: "bg-block-soft",
    ring: "border-block/35",
    dot: "bg-block",
  },
  hold: {
    text: "text-hold",
    stamp: "bg-gradient-to-br from-hold to-hold-deep",
    fill: "bg-hold-soft",
    ring: "border-hold/35",
    dot: "bg-hold",
  },
};

/* Sequence beats, in ms from the start of a run. */
const BEAT = { record: 0, proposal: 320, reasoning: 700, checks: 1150, verdict: 2300 };
const CHECK_STAGGER = 260;

export function HeroAdjudication() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [runId, setRunId] = useState(0);
  const [stage, setStage] = useState(reduced ? 5 : 0);
  const timers = useRef([]);
  const scenario = VERDICTS[index];
  const tone = TONE[scenario.tone];

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  /* One orchestrated run. Timeouts, not a rAF loop: these are discrete beats,
     and nothing here needs to be frame-accurate. */
  useEffect(() => {
    clearTimers();
    if (reduced) {
      setStage(5);
      return undefined;
    }
    setStage(0);
    const at = (ms, s) => timers.current.push(setTimeout(() => setStage(s), ms));
    at(BEAT.record + 20, 1);
    at(BEAT.proposal, 2);
    at(BEAT.reasoning, 3);
    at(BEAT.checks, 4);
    at(BEAT.verdict + scenario.checks.length * CHECK_STAGGER, 5);
    return clearTimers;
  }, [runId, index, reduced, scenario.checks.length]);

  const replay = useCallback(() => setRunId((r) => r + 1), []);
  const choose = useCallback((i) => {
    setIndex(i);
    setRunId((r) => r + 1);
  }, []);

  const visible = useCallback((s) => stage >= s, [stage]);
  const delay = useMemo(
    () => (ms) => (reduced ? undefined : { animationDelay: `${ms}ms` }),
    [reduced]
  );

  return (
    <div>
      {/* The adjudication record. Elevation and a warm-white face lift it off
          the paper ground; the console band later inverts against it. */}
      <figure
        key={runId}
        className="doc relative overflow-hidden rounded-sm"
      >
        {/* Ledger head */}
        <figcaption
          className={`flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-rule px-5 py-3 ${
            visible(1) ? "anim-rise" : "opacity-0"
          }`}
        >
          <span className="tnum text-sm">{scenario.caseId}</span>
          <span className="tnum text-sm font-semibold">{scenario.amount}</span>
          <span className="text-sm text-graphite/60">{scenario.failure}</span>
          <span className="ml-auto text-xs text-graphite/45">{scenario.meta}</span>
        </figcaption>

        <div className="divide-y divide-rule">
          {/* Proposal */}
          <div className="grid gap-x-6 px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="text-sm text-graphite/55">Agent proposes</div>
            <div>
              <div
                className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 ${
                  visible(2) ? "anim-rise" : "opacity-0"
                }`}
              >
                <span className="text-[15px] font-semibold">{scenario.proposed}</span>
                <span className="rounded-xs bg-graphite/5 px-2 py-0.5 text-xs text-graphite/60">
                  {scenario.engine} engine
                </span>
                <span className="text-xs text-graphite/55">
                  confidence <span className="tnum font-medium">{scenario.confidence}</span>
                </span>
              </div>
              <p
                className={`mt-2 max-w-[54ch] text-sm leading-relaxed text-graphite/65 ${
                  visible(3) ? "anim-rise" : "opacity-0"
                }`}
              >
                “{scenario.reasoning}”
                {stage === 3 && !reduced && (
                  <span className="anim-caret ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-graphite/50" />
                )}
              </p>
            </div>
          </div>

          {/* Policy evaluation, rule by rule */}
          <div className="grid gap-x-6 px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="text-sm text-graphite/55">Policy check</div>
            <ul className="space-y-1.5">
              {scenario.checks.map((c, i) => (
                <li
                  key={c.rule}
                  style={delay(i * CHECK_STAGGER)}
                  className={`flex items-start gap-2.5 text-sm ${
                    visible(4) ? "anim-rise" : "opacity-0"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                      c.pass ? "bg-approve/70" : tone.dot
                    }`}
                  />
                  <span
                    className={
                      c.pass ? "text-graphite/55" : `font-medium ${tone.text}`
                    }
                  >
                    {c.rule}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Verdict. Double rule is the ledger's mark for a settled total. */}
        <div
          className={`grid items-center gap-x-6 gap-y-3 border-t-[3px] border-double border-graphite px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] ${
            visible(5) ? tone.fill : ""
          } transition-colors duration-500`}
        >
          <div className="text-sm text-graphite/55">Executed</div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span
              className={`text-[15px] font-semibold ${visible(5) ? "anim-rise" : "opacity-0"}`}
            >
              {scenario.executed}
            </span>
            <span
              className={`rounded-[3px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-[0_6px_14px_-6px_rgba(20,22,26,0.55)] ${
                tone.stamp
              } ${visible(5) ? "anim-stamp" : "opacity-0"}`}
            >
              {scenario.verdict}
            </span>
          </div>
        </div>
      </figure>

      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-cream-dim">
        {scenario.note}
      </p>

      {/* Controls: a judge should be able to play with this. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="eyebrow mr-1 text-cream-dim/60">/ replay a verdict</span>
        {VERDICTS.map((v, i) => {
          const active = i === index;
          const t = TONE[v.tone];
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={active}
              className={`rounded-xs border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? `${t.ring} ${t.fill} ${t.text}`
                  : "border-cream/20 text-cream-dim hover:border-cream/45 hover:text-cream"
              }`}
            >
              {v.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={replay}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xs border border-cream/20 px-3 py-1.5 text-xs font-medium text-cream-dim transition-colors hover:border-electric hover:text-electric"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          Replay
        </button>
      </div>
    </div>
  );
}
