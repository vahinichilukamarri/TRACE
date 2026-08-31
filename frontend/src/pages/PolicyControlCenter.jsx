import { useCallback } from "react";
import { ShieldCheck, ShieldX, ShieldAlert, Fingerprint } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { KpiBlock } from "@/components/KpiBlock";
import { PolicyControlFlow } from "@/components/PolicyControlFlow";
import { ErrorState, LoadingState } from "@/components/States";
import { ACTION_LABELS } from "@/lib/domain";

const RULE_ICON = { APPROVED: ShieldCheck, BLOCKED: ShieldX, FLAGGED_FOR_REVIEW: ShieldAlert };
const RULE_COLOR = {
  APPROVED: "text-signal-mint",
  BLOCKED: "text-signal-red",
  FLAGGED_FOR_REVIEW: "text-signal-amber",
};

export default function PolicyControlCenter() {
  const fetcher = useCallback(() => api.getPolicyConfig(), []);
  const { data: config, loading, error, refresh } = useApi(fetcher, []);

  return (
    <div>
      <PageHeader
        eyebrow="Policy & control"
        title="The control layer"
        description="TRACE decides. Policy controls. Every guardrail here is deterministic and runs independently of the LLM."
      />

      <div className="px-8 py-8 space-y-10">
        {loading && <LoadingState label="Loading policy configuration" />}
        {error && <ErrorState description={error.message} onRetry={refresh} />}

        {config && (
          <>
            <Section title="Control flow">
              <PolicyControlFlow />
            </Section>

            <Section title="Guardrail thresholds">
              <div className="border border-obsidian-line bg-obsidian-soft p-6 grid grid-cols-2 md:grid-cols-4 gap-8">
                <KpiBlock label="Max recovery attempts" value={config.max_recovery_attempts} />
                <KpiBlock
                  label="Default recovery window"
                  value={`${Math.round(config.recovery_window_minutes / 60)}h`}
                  sublabel={`${config.recovery_window_minutes} minutes · per-failure-type overrides below`}
                />
                <KpiBlock label="Max same-action repeats" value={config.max_same_action_repeats} />
                <KpiBlock
                  label="High-value threshold"
                  value={`₹${Number(config.high_value_threshold).toLocaleString("en-IN")}`}
                />
                <KpiBlock label="Policy confidence floor" value={config.policy_min_confidence} />
                <KpiBlock label="Agent confidence floor" value={config.agent_min_confidence} />
                <KpiBlock label="Max reassessment iterations" value={config.max_reassessment_iterations} />
                <KpiBlock label="Agent mode" value={config.agent_mode} signal="orange" />
              </div>
            </Section>

            {config.recovery_window_overrides && (
              <Section title="Recovery windows by failure type">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(config.recovery_window_overrides.by_failure_type || {}).map(
                    ([failureType, minutes]) => (
                      <div
                        key={failureType}
                        className="border border-signal-amber/40 bg-signal-amber-dim/10 p-4"
                      >
                        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-signal-amber mb-1">
                          {failureType.replace(/_/g, " ")}
                        </div>
                        <div className="mono-tabular text-2xl font-semibold text-bone leading-none">
                          {Math.round(minutes / 60)}h
                        </div>
                        <div className="text-xs text-ink-faint font-mono mt-1">{minutes} minutes</div>
                      </div>
                    )
                  )}
                  <div className="border border-obsidian-line bg-obsidian-soft p-4">
                    <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-ink-faint mb-1">
                      All other failure types
                    </div>
                    <div className="mono-tabular text-2xl font-semibold text-bone leading-none">
                      {Math.round(config.recovery_window_minutes / 60)}h
                    </div>
                    <div className="text-xs text-ink-faint font-mono mt-1">
                      {config.recovery_window_minutes} minutes
                    </div>
                  </div>
                </div>
                <p className="text-xs text-ink-faint leading-relaxed max-w-3xl mt-3">
                  {config.recovery_window_overrides.note}
                </p>
              </Section>
            )}

            {config.intervention_costs && (
              <Section title="Intervention economics">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(config.intervention_costs.by_action || {}).map(([action, cost]) => {
                    const isDirect = (
                      config.intervention_costs.direct_recovery_actions || []
                    ).includes(action);
                    return (
                      <div
                        key={action}
                        className={`border p-4 ${
                          isDirect
                            ? "border-signal-orange/40 bg-signal-orange-dim/5"
                            : "border-obsidian-line bg-obsidian-soft"
                        }`}
                      >
                        <div className="text-sm text-bone font-medium mb-1">
                          {ACTION_LABELS[action] || action}
                        </div>
                        <div className="mono-tabular text-lg font-semibold text-bone leading-none">
                          ₹{Number(cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </div>
                        <div
                          className={`text-[10px] font-mono uppercase tracking-wide mt-1.5 ${
                            isDirect ? "text-signal-orange" : "text-ink-faint"
                          }`}
                        >
                          {isDirect ? "earns expected value" : "cost only"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-faint leading-relaxed max-w-3xl mt-3">
                  {config.intervention_costs.note}
                </p>
              </Section>
            )}

            <Section title="Duplicate event protection">
              <div className="border border-obsidian-line bg-obsidian-soft p-6 flex items-start gap-4">
                <Fingerprint className="w-5 h-5 text-signal-orange shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <div className="text-sm text-bone font-medium mb-1">
                    Every payment ID may only ever create one recovery case
                  </div>
                  <p className="text-xs text-ink-faint leading-relaxed max-w-2xl">
                    If the same payment event arrives again, TRACE does not create a duplicate case,
                    rerun the agent, resend a recovery email, or re-execute the same action. The event
                    is logged as a duplicate and linked back to the existing audit record.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Allowed actions (bounded action space)">
              <div className="flex flex-wrap gap-2">
                {config.allowed_actions.map((a) => (
                  <span
                    key={a}
                    className="text-xs font-mono px-3 py-1.5 border border-obsidian-line text-bone bg-obsidian-soft"
                  >
                    {ACTION_LABELS[a] || a}
                  </span>
                ))}
              </div>
              <p className="text-xs text-ink-faint mt-3 max-w-2xl">
                TRACE can never invent a new action, change a transaction amount, move real money, or
                contact a customer outside these approved paths.
              </p>
            </Section>

            <Section title="Escalation & stopping rules">
              <div className="border border-obsidian-line bg-obsidian-soft divide-y divide-obsidian-line">
                {config.rules.map((rule) => {
                  const Icon = RULE_ICON[rule.result] || ShieldAlert;
                  return (
                    <div key={rule.id} className="flex items-start gap-3 p-4">
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${RULE_COLOR[rule.result]}`} strokeWidth={1.5} />
                      <div className="flex-1">
                        <p className="text-sm text-bone">{rule.description}</p>
                      </div>
                      <span className={`text-[10px] font-mono uppercase tracking-wide shrink-0 ${RULE_COLOR[rule.result]}`}>
                        {rule.result.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
