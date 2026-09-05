import {
  ACTION_LABELS,
  DECISION_LABELS,
  DECISION_SIGNAL,
  SIGNAL_CLASSES,
} from "@/lib/domain";
import { formatDateTime, formatPercent } from "@/lib/format";
import { StatusPill } from "./StatusIndicator";
import { ShieldCheck, ShieldX, ShieldAlert, Cpu, Sparkles, ArrowRight, Ban } from "lucide-react";

/*
 * One adjudication pass, as consecutive rows of a single document.
 *
 * These four exports keep the props they always had, but they no longer draw
 * their own card: a case is ONE record read top to bottom -- engine, proposal,
 * economics, verdict, execution, outcome -- not four tiles in a grid. The
 * caller supplies the cream surface; each panel contributes labelled rows
 * separated by the document's hairlines.
 */

/** The document's row primitive: a label gutter and its content. */
function Row({ label, children, accent = false }) {
  return (
    <div
      className={`grid gap-x-6 gap-y-2 border-t border-rule px-5 py-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:px-7 ${
        // A row policy interfered with carries a coloured edge, so an override
        // is visible from the scroll position rather than only on close read.
        accent ? "border-l-[3px] border-l-block bg-block-soft/45" : ""
      }`}
    >
      <div className="eyebrow pt-1 text-graphite/60">/ {label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ engine */

const ENGINE_STYLE = {
  // The engine that actually reasoned. An LLM call is the expensive path and
  // reads in the accent; the heuristic is the default and stays in ink.
  LLM: {
    box: "border-electric/45 bg-electric/8",
    name: "text-electric",
    icon: Sparkles,
    caption: "Language model · escalated by the router",
  },
  HEURISTIC: {
    box: "border-rule bg-paper-alt",
    name: "text-graphite",
    icon: Cpu,
    caption: "Deterministic fit table · no model call",
  },
};

const FALLBACK_ENGINE = {
  box: "border-hold/50 bg-hold-soft",
  name: "text-hold-deep",
  icon: ShieldAlert,
  caption: "Reasoning call failed · no engine produced a judgment",
};

function RoutingBadge({ decision }) {
  const style = decision.is_fallback
    ? FALLBACK_ENGINE
    : ENGINE_STYLE[decision.agent_mode] || ENGINE_STYLE.HEURISTIC;
  const Icon = style.icon;
  return (
    <div className={`max-w-2xl rounded-xs border ${style.box}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 pb-2.5 pt-3">
        <Icon className={`h-4 w-4 shrink-0 ${style.name}`} strokeWidth={1.5} />
        <span
          className={`tnum text-base font-semibold uppercase tracking-[0.16em] ${style.name}`}
        >
          {decision.is_fallback ? "fallback" : decision.agent_mode}
        </span>
        <span className="wrap-prose text-[11px] leading-snug text-graphite/70">
          {style.caption}
        </span>
      </div>
      {decision.route_reason && (
        <div className="border-t border-rule/70 px-3.5 py-2.5">
          {/* /70, not /60: on the LLM badge's electric tint the lighter step
              lands at 4.49:1, just under the floor. */}
          <span className="eyebrow text-graphite/70">/ route reason</span>
          <p className="wrap-prose mt-1 text-xs leading-relaxed text-graphite/80">
            {decision.route_reason}
          </p>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- economics */

function LedgerLine({ label, value, tone = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-xs text-graphite/70">{label}</span>
      <span className={`tnum wrap-id text-right text-sm ${tone || "text-graphite"}`}>{value}</span>
    </div>
  );
}

const inr = (v) => `₹${Number(Math.abs(v)).toLocaleString("en-IN")}`;

/** The economics, set as a ledger calculation: two entries, double rule, total. */
function EconomicsLedger({ decision }) {
  const net = decision.net_expected_value;
  const positive = net >= 0;
  return (
    <div className="max-w-sm">
      <LedgerLine label="Expected value" value={inr(decision.expected_value)} />
      <LedgerLine
        label="Intervention cost"
        value={`−${inr(decision.intervention_cost)}`}
        tone="text-graphite/70"
      />
      <div className="rule-double mt-1.5 pt-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="eyebrow text-graphite/70">net expected value</span>
          <span
            className={`tnum wrap-id text-right text-xl font-semibold ${
              positive ? "text-approve-deep" : "text-signal-red"
            }`}
          >
            {positive ? "+" : "−"}
            {inr(net)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- decision */

/** What TRACE decided, and its confidence -- the agent's recommendation, pre-policy. */
export function DecisionPanel({ decision }) {
  if (!decision) return null;
  const signal = DECISION_SIGNAL[decision.decision] || "neutral";
  const cls = SIGNAL_CLASSES[signal];
  return (
    <>
      <Row label="engine">
        <RoutingBadge decision={decision} />
      </Row>

      <Row label="proposal">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`min-w-0 text-base font-semibold ${cls.text}`}>
            {DECISION_LABELS[decision.decision] || decision.decision.replace(/_/g, " ")}
          </span>
          <span className="tnum shrink-0 text-sm text-graphite/70">
            {formatPercent(decision.confidence)} confidence
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="eyebrow text-graphite/60">proposed action</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-graphite/60" strokeWidth={1.5} />
          <span className="wrap-prose text-sm font-semibold text-graphite">
            {ACTION_LABELS[decision.action] || decision.action}
          </span>
        </div>
        <p className="wrap-prose mt-3 text-sm leading-relaxed text-graphite/80">
          {decision.reasoning}
        </p>
      </Row>

      {/* A fallback never evaluated the case, so the -Rs 150 escalation cost is
          not a considered economic judgment. Say what it is instead of dressing
          it up as one. */}
      {decision.is_fallback && (
        <Row label="economics">
          <div className="max-w-xl rounded-xs border border-hold/50 bg-hold-soft p-3.5">
            <div className="eyebrow mb-1.5 text-hold-deep">/ expected value not computed</div>
            <p className="wrap-prose text-xs leading-relaxed text-graphite/75">
              The reasoning call failed, so this case was never evaluated. It was escalated to a
              human rather than decided. The
              {decision.intervention_cost != null
                ? ` ${inr(decision.intervention_cost)} `
                : " "}
              escalation cost is a handling cost, not a judgment about whether recovery was worth
              pursuing.
            </p>
          </div>
        </Row>
      )}

      {!decision.is_fallback && decision.net_expected_value != null && (
        <Row label="economics">
          <EconomicsLedger decision={decision} />
        </Row>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ policy */

const POLICY_ICON = {
  APPROVED: ShieldCheck,
  BLOCKED: ShieldX,
  FLAGGED_FOR_REVIEW: ShieldAlert,
};

// The verdict, as a stamp: a saturated block carrying cream type. Policy is the
// one layer whose answer is final, so it is the only thing on the cream side
// that gets a filled surface rather than a tint.
const VERDICT_STAMP = {
  APPROVED: "bg-approve-deep text-paper",
  BLOCKED: "bg-block-deep text-paper",
  FLAGGED_FOR_REVIEW: "bg-hold-deep text-paper",
};

/** Every guardrail result, shown explicitly -- the deterministic control layer. */
export function PolicyCheckPanel({ policy }) {
  if (!policy) return null;
  const Icon = POLICY_ICON[policy.result] || ShieldAlert;
  const overridden = !!policy.final_action && policy.final_action !== policy.proposed_action;
  const reasons = Array.isArray(policy.reasons)
    ? policy.reasons
    : policy.reasons
      ? [policy.reasons]
      : [];

  return (
    <>
      <Row label="policy check">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`inline-flex items-center gap-2 rounded-xs px-3 py-1.5 ${
              VERDICT_STAMP[policy.result] || "bg-graphite text-paper"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="tnum text-sm font-semibold uppercase tracking-[0.16em]">
              {policy.result.replace(/_/g, " ")}
            </span>
          </span>
          <span className="text-xs text-graphite/70">
            nine deterministic guardrails, no model involved
          </span>
        </div>

        {reasons.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-graphite/80">
                <span aria-hidden="true" className="shrink-0 text-graphite/60">
                  ·
                </span>
                <span className="wrap-prose min-w-0">
                  {typeof r === "string" ? r : JSON.stringify(r)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Row>

      {/* An override is the whole point of the control layer. It must never be
          something you have to compare two action names to notice. */}
      {overridden && (
        <Row label="override" accent>
          <div className="rounded-xs border-2 border-block bg-block-soft p-4">
            <div className="eyebrow flex items-center gap-2 text-block-deep">
              <Ban className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              policy overrode the agent
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="wrap-prose text-sm text-graphite/70 line-through">
                {ACTION_LABELS[policy.proposed_action] || policy.proposed_action}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-block-deep" strokeWidth={2} />
              <span className="wrap-prose rounded-xs bg-block-deep px-2.5 py-1 text-sm font-semibold text-paper">
                {ACTION_LABELS[policy.final_action] || policy.final_action}
              </span>
            </div>
            <p className="wrap-prose mt-3 text-xs leading-relaxed text-graphite/70">
              The proposed action never ran. Policy substituted the action above and that is what
              executed.
            </p>
          </div>
        </Row>
      )}
    </>
  );
}

/* --------------------------------------------------------------- execution */

/** What actually happened when the approved action ran. */
const DELIVERY_STYLE = {
  REAL: "border-signal-mint/45 bg-signal-mint-dim",
  SIMULATED: "border-rule bg-paper-alt",
  FAILED: "border-signal-red/45 bg-signal-red-dim",
};

const DELIVERY_LABEL = {
  REAL: "text-approve-deep",
  SIMULATED: "text-graphite/70",
  FAILED: "text-signal-red",
};

const DELIVERY_COPY = {
  REAL: "Sent for real over SMTP and accepted by the mail server.",
  SIMULATED: "Rendered in full but not delivered. Nothing reached a real inbox.",
  FAILED: "The send was attempted and rejected. No email reached the customer.",
};

export function ExecutionPanel({ execution }) {
  if (!execution) return null;
  const isReal = execution.execution_type === "REAL";
  const details = typeof execution.details === "object" ? execution.details : null;
  const delivery = details?.delivery || null;
  return (
    <Row label="executed">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="wrap-prose text-sm font-semibold text-graphite">
          {ACTION_LABELS[execution.action] || execution.action}
        </span>
        <span
          className={`eyebrow shrink-0 rounded-xs border px-1.5 py-0.5 ${
            isReal ? "border-electric/45 text-electric" : "border-rule text-graphite/70"
          }`}
        >
          {isReal ? "real" : "simulated"}
        </span>
        <span className="tnum text-xs text-graphite/70">status: {execution.status}</span>
        <span className="tnum ml-auto text-[11px] text-graphite/60">
          {formatDateTime(execution.created_at)}
        </span>
      </div>

      {/* Email actions carry the actual delivery result. A FAILED send must
          never read as a success just because the action executed. */}
      {delivery && (
        <div
          className={`mt-3 rounded-xs border p-3 ${DELIVERY_STYLE[delivery] || DELIVERY_STYLE.SIMULATED}`}
        >
          <div className={`eyebrow mb-1.5 ${DELIVERY_LABEL[delivery] || DELIVERY_LABEL.SIMULATED}`}>
            / email delivery · {delivery}
          </div>
          <p className="wrap-prose text-xs leading-relaxed text-graphite/75">
            {DELIVERY_COPY[delivery] || `Delivery reported as ${delivery}.`}
          </p>
          {/* Addresses and SMTP errors are unbroken strings; without character
              wrapping they push the whole panel wider than its column. */}
          {details?.to && (
            <div className="tnum wrap-id mt-1.5 text-[11px] text-graphite/70">to: {details.to}</div>
          )}
          {delivery === "FAILED" && details?.error && (
            <div className="tnum wrap-id mt-1.5 text-[11px] text-signal-red">{details.error}</div>
          )}
          {delivery === "SIMULATED" && details?.simulated_reason && (
            <div className="wrap-prose mt-1.5 text-[11px] text-graphite/70">
              {details.simulated_reason}
            </div>
          )}
        </div>
      )}

      {/* The raw payload stays available -- it is the evidence -- but folded
          away: unfolded it is taller than the reasoning it sits under, and the
          delivery panel above already says what it means. */}
      {execution.details && (
        <details className="mt-3">
          <summary className="eyebrow cursor-pointer list-none text-graphite/60 transition-colors hover:text-electric">
            / raw execution payload
          </summary>
          <pre className="mt-2 max-w-full overflow-x-auto rounded-xs border border-rule bg-paper-alt p-2.5 text-[11px] leading-relaxed text-graphite/80">
            {typeof execution.details === "string"
              ? execution.details
              : JSON.stringify(execution.details, null, 2)}
          </pre>
        </details>
      )}
    </Row>
  );
}

/* ----------------------------------------------------------------- outcome */

/** Recovered / not recovered -- always labeled simulated vs real. */
export function OutcomePanel({ outcome }) {
  if (!outcome) return null;
  const signal =
    outcome.outcome === "RECOVERED" ? "mint" : outcome.outcome === "NOT_RECOVERED" ? "red" : "amber";
  return (
    <Row label="outcome">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <StatusPill signal={signal}>{outcome.outcome.replace(/_/g, " ")}</StatusPill>
        {outcome.revenue_recovered != null && (
          <span className="tnum wrap-id text-2xl font-semibold text-approve-deep">
            {inr(outcome.revenue_recovered)}
          </span>
        )}
        <span className="tnum wrap-prose ml-auto text-[11px] text-graphite/60">
          {outcome.simulated ? "Simulated financial outcome" : "Real event"} ·{" "}
          {formatDateTime(outcome.created_at)}
        </span>
      </div>
    </Row>
  );
}
