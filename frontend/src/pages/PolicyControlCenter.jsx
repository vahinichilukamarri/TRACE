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
                  label="Recovery window"
                  value={`${Math.round(config.recovery_window_minutes / 60)}h`}
                  sublabel={`${config.recovery_window_minutes} minutes`}
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
