import { ACTION_LABELS, DECISION_SIGNAL, POLICY_SIGNAL, SIGNAL_CLASSES } from "@/lib/domain";
import { formatDateTime, formatPercent } from "@/lib/format";
import { StatusPill } from "./StatusIndicator";
import { ShieldCheck, ShieldX, ShieldAlert, Brain } from "lucide-react";

/** What TRACE decided, and its confidence -- the agent's recommendation, pre-policy. */
export function DecisionPanel({ decision }) {
  if (!decision) return null;
  const signal = DECISION_SIGNAL[decision.decision] || "neutral";
  const cls = SIGNAL_CLASSES[signal];
  return (
    <div className="border border-obsidian-line bg-obsidian-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-signal-orange" strokeWidth={1.5} />
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-bone">
            TRACE decision
          </span>
        </div>
        <span className="text-[10px] font-mono text-ink-faint">
          {decision.agent_mode}
          {decision.is_fallback ? " · fallback" : ""} · iteration {decision.iteration}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-semibold ${cls.text}`}>
          {decision.decision.replace(/_/g, " ")}
        </span>
        <span className="mono-tabular text-sm text-bone">
          {formatPercent(decision.confidence)}
          <span className="text-ink-faint text-[10px] ml-1">confidence</span>
        </span>
      </div>

      <div className="text-xs font-mono text-ink-faint mb-1">Selected action</div>
      <div className="text-sm text-signal-orange font-medium mb-3">
        {ACTION_LABELS[decision.action] || decision.action}
      </div>

      {decision.net_expected_value != null && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-obsidian border border-obsidian-line p-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-ink-faint mb-1">
              Expected value
            </div>
            <div className="mono-tabular text-sm text-bone">
              ₹{Number(decision.expected_value).toLocaleString("en-IN")}
            </div>
          </div>
          <div className="bg-obsidian border border-obsidian-line p-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-ink-faint mb-1">
              Intervention cost
            </div>
            <div className="mono-tabular text-sm text-bone">
              −₹{Number(decision.intervention_cost).toLocaleString("en-IN")}
            </div>
          </div>
          <div className="bg-obsidian border border-obsidian-line p-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-ink-faint mb-1">
              Net expected value
            </div>
            <div
              className={`mono-tabular text-sm ${
                decision.net_expected_value >= 0 ? "text-signal-mint" : "text-signal-red"
              }`}
            >
              {decision.net_expected_value >= 0 ? "+" : "−"}₹
              {Number(Math.abs(decision.net_expected_value)).toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs font-mono text-ink-faint mb-1">Reasoning</div>
      <p className="text-sm text-bone leading-relaxed">{decision.reasoning}</p>

      <div className="text-[10px] font-mono text-ink-faint mt-3">
        {formatDateTime(decision.created_at)}
      </div>
    </div>
  );
}

const POLICY_ICON = {
  APPROVED: ShieldCheck,
  BLOCKED: ShieldX,
  FLAGGED_FOR_REVIEW: ShieldAlert,
};

/** Every guardrail result, shown explicitly -- the deterministic control layer. */
export function PolicyCheckPanel({ policy }) {
  if (!policy) return null;
  const signal = POLICY_SIGNAL[policy.result] || "neutral";
  const cls = SIGNAL_CLASSES[signal];
  const Icon = POLICY_ICON[policy.result] || ShieldAlert;
  const reasons = Array.isArray(policy.reasons)
    ? policy.reasons
    : policy.reasons
    ? [policy.reasons]
    : [];

  return (
    <div className="border border-obsidian-line bg-obsidian-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 ${cls.text}`} strokeWidth={1.5} />
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-bone">
            Policy check
          </span>
        </div>
        <StatusPill signal={signal}>{policy.result.replace(/_/g, " ")}</StatusPill>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono text-ink-faint mb-2">
        <span>proposed: {ACTION_LABELS[policy.proposed_action] || policy.proposed_action}</span>
        {policy.final_action && policy.final_action !== policy.proposed_action && (
          <span className="text-signal-amber">
            → final: {ACTION_LABELS[policy.final_action] || policy.final_action}
          </span>
        )}
      </div>

      {reasons.length > 0 && (
        <ul className="space-y-1 mt-2">
          {reasons.map((r, i) => (
            <li key={i} className="text-xs text-bone flex gap-2">
              <span className="text-ink-faint">·</span>
              <span>{typeof r === "string" ? r : JSON.stringify(r)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="text-[10px] font-mono text-ink-faint mt-3">
        {formatDateTime(policy.created_at)}
      </div>
    </div>
  );
}

/** What actually happened when the approved action ran. */
export function ExecutionPanel({ execution }) {
  if (!execution) return null;
  const isReal = execution.execution_type === "REAL";
  return (
    <div className="border border-obsidian-line bg-obsidian-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-bone">Execution</span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 border ${
            isReal ? "border-signal-orange/40 text-signal-orange" : "border-mist-line/60 text-ink-faint"
          }`}
        >
          {isReal ? "REAL" : "SIMULATED"}
        </span>
      </div>
      <div className="text-sm text-bone font-medium mb-1">
        {ACTION_LABELS[execution.action] || execution.action}
      </div>
      <div className="text-xs font-mono text-ink-faint mb-2">status: {execution.status}</div>
      {execution.details && (
        <pre className="text-[11px] font-mono text-ink-soft bg-obsidian rounded-xs p-2 overflow-x-auto">
          {typeof execution.details === "string"
            ? execution.details
            : JSON.stringify(execution.details, null, 2)}
        </pre>
      )}
      <div className="text-[10px] font-mono text-ink-faint mt-3">
        {formatDateTime(execution.created_at)}
      </div>
    </div>
  );
}

/** Recovered / not recovered -- always labeled simulated vs real. */
export function OutcomePanel({ outcome }) {
  if (!outcome) return null;
  const signal = outcome.outcome === "RECOVERED" ? "mint" : outcome.outcome === "NOT_RECOVERED" ? "red" : "amber";
  return (
    <div className="border border-obsidian-line bg-obsidian-soft p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-bone">Outcome</span>
        <StatusPill signal={signal}>{outcome.outcome.replace(/_/g, " ")}</StatusPill>
      </div>
      {outcome.revenue_recovered != null && (
        <div className="mono-tabular text-lg text-signal-mint font-semibold">
          ₹{Number(outcome.revenue_recovered).toLocaleString("en-IN")}
        </div>
      )}
      <div className="text-[10px] font-mono text-ink-faint mt-2">
        {outcome.simulated ? "Simulated financial outcome" : "Real event"} ·{" "}
        {formatDateTime(outcome.created_at)}
      </div>
    </div>
  );
}
