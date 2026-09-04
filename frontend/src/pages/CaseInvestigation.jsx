import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { MousePointerClick, RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { Button } from "@/components/Button";
import { RecoveryTraceLine } from "@/components/RecoveryTraceLine";
import { Timeline } from "@/components/Timeline";
import { DecisionPanel, PolicyCheckPanel, ExecutionPanel, OutcomePanel } from "@/components/DecisionPanels";
import { StatusPill } from "@/components/StatusIndicator";
import { ErrorState, LoadingState } from "@/components/States";
import { deriveTraceStage } from "@/lib/caseStage";
import { groupCaseIterations } from "@/lib/caseGrouping";
import {
  CASE_STATUS_LABELS,
  DECISION_WORTHINESS,
  FAILURE_LABELS,
  STATUS_SIGNAL,
} from "@/lib/domain";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";

// Actions that send the customer a clickable link -- kept in sync with
// app/execution.py's resolve_after_click.
const LINK_ACTIONS = ["SEND_RECOVERY_LINK", "SUGGEST_ALTERNATIVE_METHOD"];

export default function CaseInvestigation() {
  const { paymentId } = useParams();
  const [actionPending, setActionPending] = useState(false);

  const fetcher = useCallback(() => api.getCase(paymentId), [paymentId]);
  const { data: caseData, loading, error, refresh } = useApi(fetcher, [paymentId]);

  const { activeIndex, finalSignal, reassessed } = deriveTraceStage(caseData);
  const rounds = groupCaseIterations(caseData);
  const latestDecision = caseData?.decisions?.[caseData.decisions.length - 1];
  const isTerminal = caseData && caseData.status !== "OPEN";

  const canReassess = caseData && !isTerminal;

  // Mirror the backend's resolve_after_click: it resolves the most recent
  // SEND_RECOVERY_LINK *or* SUGGEST_ALTERNATIVE_METHOD execution that is still
  // PENDING. Keying off the last *decision*'s action (and only the link action)
  // meant alternative-method cases showed no way to simulate the click, so their
  // pending outcome could never be resolved. Policy can also override the
  // proposed action, so key off what actually executed.
  const linkExecution = [...(caseData?.executions || [])]
    .reverse()
    .find((e) => LINK_ACTIONS.includes(e.action));
  // Gate on engagement, not on "a PENDING outcome exists": resolving a click
  // appends a new outcome row rather than updating the original PENDING one,
  // so a pending-row check stays true forever and lets you click repeatedly,
  // appending a duplicate outcome each time. LINK_SENT -> LINK_CLICKED is the
  // one-shot transition the backend actually models.
  const canClick =
    caseData && !isTerminal && !!linkExecution && caseData.customer_engagement === "LINK_SENT";

  const handleReassess = async () => {
    setActionPending(true);
    try {
      await api.reassessCase(paymentId);
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionPending(false);
    }
  };

  const handleClick = async () => {
    setActionPending(true);
    try {
      await api.clickRecoveryLink(paymentId);
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Case investigation"
        title={paymentId}
        description="Why TRACE did what it did -- every observation, decision, guardrail, and outcome, in order."
        action={
          caseData && (
            <div className="flex items-center gap-2">
              {canClick && (
                <Button variant="secondary" onClick={handleClick} disabled={actionPending}>
                  <MousePointerClick className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Simulate link click
                </Button>
              )}
              {canReassess && (
                <Button onClick={handleReassess} disabled={actionPending}>
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Reassess now
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="px-8 py-8 space-y-10">
        {loading && <LoadingState label="Loading case" />}
        {error && (
          <ErrorState
            title={error.status === 404 ? "Case not found" : "This case failed to load"}
            description={error.status === 404 ? `No case exists for payment ID "${paymentId}".` : error.message}
            onRetry={error.status === 404 ? undefined : refresh}
          />
        )}

        {caseData && (
          <>
            {/* Transaction summary */}
            <Section title="Transaction summary">
              <div className="border border-obsidian-line bg-obsidian-soft p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-ink-faint mb-1">
                      Amount
                    </div>
                    <div className="mono-tabular text-2xl font-semibold text-bone">
                      {formatCurrency(caseData.amount, caseData.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-ink-faint mb-1">
                      Failure
                    </div>
                    <div className="text-sm text-bone font-medium">
                      {FAILURE_LABELS[caseData.failure_type] || caseData.failure_type || "Unclassified"}
                    </div>
                    <div className="text-[10px] font-mono text-ink-faint mt-0.5">
                      {caseData.classification_method}
                      {caseData.classification_confidence != null &&
                        ` · ${formatPercent(caseData.classification_confidence)} confidence`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-ink-faint mb-1">
                      Current state
                    </div>
                    <StatusPill signal={STATUS_SIGNAL[caseData.status] || "neutral"}>
                      {CASE_STATUS_LABELS[caseData.status] || caseData.status}
                    </StatusPill>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wide text-ink-faint mb-1">
                      Recovery worthiness
                    </div>
                    <div className="text-sm text-bone font-medium">
                      {latestDecision
                        ? DECISION_WORTHINESS[latestDecision.decision] ||
                          latestDecision.decision.replace(/_/g, " ")
                        : "Not yet evaluated"}
                    </div>
                    {latestDecision && (
                      <div className="text-[10px] font-mono text-ink-faint mt-0.5">
                        {formatPercent(latestDecision.confidence)} confidence
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 pt-6 border-t border-obsidian-line text-xs font-mono text-ink-faint">
                  <div>customer success rate: <span className="text-bone">{Math.round(caseData.customer_success_rate * 100)}%</span></div>
                  <div>previous failures: <span className="text-bone">{caseData.previous_failures}</span></div>
                  <div>recovery attempts: <span className="text-bone">{caseData.previous_recovery_attempts}</span></div>
                  <div>opportunities left: <span className="text-bone">{caseData.remaining_recovery_opportunities}</span></div>
                  <div>customer engagement: <span className="text-bone">{caseData.customer_engagement}</span></div>
                  <div>time since failure: <span className="text-bone">{caseData.time_since_failure_minutes}m</span></div>
                  <div>source: <span className="text-bone">{caseData.source}</span></div>
                  <div>created: <span className="text-bone">{formatDateTime(caseData.created_at)}</span></div>
                </div>

                <RecoveryTraceLine activeIndex={activeIndex} finalSignal={finalSignal} reassessed={reassessed} />
              </div>
            </Section>

            {/* Decision rounds -- reasoning, policy, action, outcome grouped per reassessment pass */}
            <Section title={rounds.length > 1 ? "Decision rounds (reassessment history)" : "TRACE decision"}>
              <div className="space-y-6">
                {rounds.map((round, i) => (
                  <div key={i}>
                    {rounds.length > 1 && (
                      <div className="text-[10px] font-mono uppercase tracking-wide text-signal-amber mb-2">
                        {i === 0 ? "Initial pass" : `Reassessment ${i}`} · iteration {round.iteration}
                      </div>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <DecisionPanel decision={round.decision} />
                      <PolicyCheckPanel policy={round.policy} />
                      {round.execution && <ExecutionPanel execution={round.execution} />}
                      {round.outcome && <OutcomePanel outcome={round.outcome} />}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Recovery timeline */}
            <Section title="Recovery timeline">
              <div className="border border-obsidian-line bg-obsidian-soft p-6">
                <Timeline entries={caseData.audit_log} />
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
