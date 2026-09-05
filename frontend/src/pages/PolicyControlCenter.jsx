import { useCallback } from "react";
import { ShieldCheck, ShieldX, ShieldAlert, Fingerprint } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { PolicyControlFlow } from "@/components/PolicyControlFlow";
import { ErrorState, LoadingState } from "@/components/States";
import { ACTION_LABELS } from "@/lib/domain";

/*
 * The control layer as the document it actually is: a rules register. Every
 * section here is a table with a fixed value column, hairline rows and a double
 * rule under each head -- the guardrails, the thresholds they read, the windows
 * they enforce, and the costs they price. Nothing is a dashboard tile, because
 * none of it is a measurement; it is all standing policy.
 */

const RULE_ICON = { APPROVED: ShieldCheck, BLOCKED: ShieldX, FLAGGED_FOR_REVIEW: ShieldAlert };
const RULE_COLOR = {
  APPROVED: "text-approve-deep",
  BLOCKED: "text-signal-red",
  FLAGGED_FOR_REVIEW: "text-hold-deep",
};

/** A cream document with a slash-eyebrow head and a double rule beneath it. */
function Register({ title, note, children, foot }) {
  return (
    <div className="record overflow-hidden">
      <div className="px-4 pb-2 pt-4 sm:px-6">
        <div className="eyebrow text-graphite/60">/ {title}</div>
        {note && (
          <p className="wrap-prose mt-1.5 max-w-3xl text-xs leading-relaxed text-graphite/70">
            {note}
          </p>
        )}
      </div>
      <div className="rule-double mx-4 sm:mx-6">{children}</div>
      {foot && (
        <p className="wrap-prose max-w-3xl px-4 pb-4 pt-3 text-xs leading-relaxed text-graphite/70 sm:px-6">
          {foot}
        </p>
      )}
      {!foot && <div className="h-4" />}
    </div>
  );
}

/** One line of a register: name on the left, figure on the right. */
function Entry({ index, label, value, unit, tone = "text-graphite" }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 border-b border-rule py-2.5 last:border-b-0">
      <div className="flex min-w-0 gap-3">
        {index && <span className="tnum shrink-0 text-[11px] text-graphite/60">{index}</span>}
        <span className="wrap-prose text-sm text-graphite/80">{label}</span>
      </div>
      <div className="text-right">
        <span className={`tnum wrap-id text-sm font-semibold ${tone}`}>{value}</span>
        {unit && <div className="tnum mt-0.5 text-[11px] text-graphite/70">{unit}</div>}
      </div>
    </div>
  );
}

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

      <div className="space-y-10 px-6 py-8 sm:px-8">
        {loading && <LoadingState label="Loading policy configuration" />}
        {error && <ErrorState description={error.message} onRetry={refresh} />}

        {config && (
          <>
            <Section title="Control flow">
              <div className="record p-5">
                <PolicyControlFlow />
              </div>
            </Section>

            {/* -------------------------------------------- the nine rules */}
            <Section title="The guardrails">
              <Register
                title={`${config.rules.length} rules, evaluated in order`}
                note="Each rule returns one verdict. The first rule that blocks or flags decides the outcome, and its reason is written to the case's audit record verbatim."
              >
                {config.rules.map((rule, i) => {
                  const Icon = RULE_ICON[rule.result] || ShieldAlert;
                  return (
                    <div
                      key={rule.id}
                      className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 border-b border-rule py-3 last:border-b-0 sm:grid-cols-[1.75rem_minmax(0,1fr)_11rem]"
                    >
                      <span className="tnum text-[11px] text-graphite/60">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="wrap-prose text-sm leading-relaxed text-graphite/85">
                        {rule.description}
                      </p>
                      <span
                        className={`eyebrow col-start-2 inline-flex items-center gap-1.5 sm:col-start-3 sm:justify-end ${
                          RULE_COLOR[rule.result] || "text-graphite/70"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                        {rule.result.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })}
              </Register>
            </Section>

            {/* ------------------------------------------------- thresholds */}
            <Section title="Thresholds in force">
              <div className="grid gap-4 lg:grid-cols-2">
                <Register title="limits">
                  <Entry label="Max recovery attempts" value={config.max_recovery_attempts} />
                  <Entry
                    label="Max same-action repeats"
                    value={config.max_same_action_repeats}
                  />
                  <Entry
                    label="Max reassessment iterations"
                    value={config.max_reassessment_iterations}
                  />
                  <Entry
                    label="High-value threshold"
                    value={`₹${Number(config.high_value_threshold).toLocaleString("en-IN")}`}
                  />
                </Register>
                <Register title="confidence & routing">
                  <Entry label="Policy confidence floor" value={config.policy_min_confidence} />
                  <Entry label="Agent confidence floor" value={config.agent_min_confidence} />
                  <Entry
                    label="Default recovery window"
                    value={`${Math.round(config.recovery_window_minutes / 60)}h`}
                    unit={`${config.recovery_window_minutes} minutes`}
                  />
                  <Entry label="Agent mode" value={config.agent_mode} tone="text-electric" />
                </Register>
              </div>
            </Section>

            {/* -------------------------------------------- recovery windows */}
            {config.recovery_window_overrides && (
              <Section title="Recovery windows by failure type">
                <Register title="window overrides" foot={config.recovery_window_overrides.note}>
                  {Object.entries(config.recovery_window_overrides.by_failure_type || {}).map(
                    ([failureType, minutes]) => (
                      <Entry
                        key={failureType}
                        label={failureType.replace(/_/g, " ")}
                        value={`${Math.round(minutes / 60)}h`}
                        unit={`${minutes} minutes`}
                      />
                    )
                  )}
                  <Entry
                    label="All other failure types"
                    value={`${Math.round(config.recovery_window_minutes / 60)}h`}
                    unit={`${config.recovery_window_minutes} minutes`}
                    tone="text-graphite/70"
                  />
                </Register>
              </Section>
            )}

            {/* ---------------------------------------- intervention pricing */}
            {config.intervention_costs && (
              <Section title="Intervention economics">
                <Register title="cost per action" foot={config.intervention_costs.note}>
                  {Object.entries(config.intervention_costs.by_action || {}).map(
                    ([action, cost]) => {
                      const isDirect = (
                        config.intervention_costs.direct_recovery_actions || []
                      ).includes(action);
                      return (
                        <Entry
                          key={action}
                          label={
                            <>
                              {ACTION_LABELS[action] || action}
                              <span
                                className={`eyebrow ml-3 ${
                                  isDirect ? "text-electric" : "text-graphite/60"
                                }`}
                              >
                                {isDirect ? "earns expected value" : "cost only"}
                              </span>
                            </>
                          }
                          value={`₹${Number(cost).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}`}
                        />
                      );
                    }
                  )}
                </Register>
              </Section>
            )}

            {/* ------------------------------------------- bounded actions */}
            <Section title="Allowed actions (bounded action space)">
              <Register
                title="the whole action space"
                foot="TRACE can never invent a new action, change a transaction amount, move real money, or contact a customer outside these approved paths."
              >
                {config.allowed_actions.map((a, i) => (
                  <Entry
                    key={a}
                    index={String(i + 1).padStart(2, "0")}
                    label={ACTION_LABELS[a] || a}
                    value={a}
                    tone="text-graphite/70"
                  />
                ))}
              </Register>
            </Section>

            {/* --------------------------------------------- idempotency */}
            <Section title="Duplicate event protection">
              <div className="record flex items-start gap-4 p-6">
                <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-electric" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="mb-1 text-sm font-semibold text-graphite">
                    Every payment ID may only ever create one recovery case
                  </div>
                  <p className="wrap-prose max-w-2xl text-xs leading-relaxed text-graphite/70">
                    If the same payment event arrives again, TRACE does not create a duplicate case,
                    rerun the agent, resend a recovery email, or re-execute the same action. The event
                    is logged as a duplicate and linked back to the existing audit record.
                  </p>
                </div>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
