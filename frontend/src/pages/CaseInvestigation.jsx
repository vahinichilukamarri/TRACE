import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { MousePointerClick, RefreshCw, Ban } from "lucide-react";
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

/*
 * A case is one adjudication document, read top to bottom: what failed, what
 * the agent proposed and why, what the control layer did with it, what actually
 * executed, and what happened. Each reassessment is a further entry in the same
 * document rather than a separate view, so the agent adapting across passes is
 * something you SEE rather than something you have to reconstruct.
 */

// Actions that send the customer a clickable link -- kept in sync with
// app/execution.py's resolve_after_click.
const LINK_ACTIONS = ["SEND_RECOVERY_LINK", "SUGGEST_ALTERNATIVE_METHOD"];

/** One label/value pair in the context band. */
function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow text-graphite/60">{label}</div>
      <div className="tnum wrap-id mt-1 text-sm text-graphite">{value}</div>
    </div>
  );
}

/** The banded rule that opens each pass -- the document's equivalent of a
 *  ledger line number. */
function PassHeader({ index, round, overridden }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t border-graphite/25 bg-paper-alt px-5 py-3 sm:px-7">
      <span className="tnum text-sm font-semibold text-graphite">
        /{String(index + 1).padStart(2, "0")}
      </span>
      <span className="eyebrow text-graphite">
        {index === 0 ? "initial assessment" : `reassessment ${index}`}
      </span>
      <span className="tnum text-[11px] text-graphite/70">iteration {round.iteration}</span>
      {overridden && (
        <span className="eyebrow inline-flex items-center gap-1.5 rounded-xs bg-block-deep px-2 py-0.5 text-paper">
          <Ban className="h-3 w-3 shrink-0" strokeWidth={2} />
          overridden
        </span>
      )}
      <span className="tnum ml-auto text-[11px] text-graphite/70">
        {formatDateTime(round.decision.created_at)}
      </span>
    </div>
  );
}

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

  const overrideCount = rounds.filter(
    (r) => r.policy?.final_action && r.policy.final_action !== r.policy.proposed_action
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Case investigation"
        title={paymentId}
        description="Why TRACE did what it did — every observation, decision, guardrail, and outcome, in order."
        action={
          caseData && (
            <div className="flex flex-wrap items-center gap-2">
              {canClick && (
                <Button variant="secondary" onClick={handleClick} disabled={actionPending}>
                  <MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Simulate link click
                </Button>
              )}
              {canReassess && (
                <Button onClick={handleReassess} disabled={actionPending}>
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Reassess now
                </Button>
              )}
            </div>
          )
        }
      />

      {/* The lifecycle belongs to the desk, not the document: it reports where
          the case has got to, while the document below is the record itself. */}
      {caseData && (
        <div className="border-b border-void-line px-6 pb-6 pt-6 sm:px-8">
          <RecoveryTraceLine
            activeIndex={activeIndex}
            finalSignal={finalSignal}
            reassessed={reassessed}
          />
        </div>
      )}

      <div className="space-y-8 px-6 py-8 sm:px-8">
        {loading && <LoadingState label="Loading case" />}
        {error && (
          <ErrorState
            title={error.status === 404 ? "Case not found" : "This case failed to load"}
            description={
              error.status === 404
                ? `No case exists for payment ID "${paymentId}".`
                : error.message
            }
            onRetry={error.status === 404 ? undefined : refresh}
          />
        )}

        {caseData && (
          <>
            <article className="record overflow-hidden">
              {/* ------------------------------------------------- masthead */}
              <header className="px-5 pb-5 pt-6 sm:px-7">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  <span className="eyebrow text-graphite/60">/ adjudication record</span>
                  <StatusPill signal={STATUS_SIGNAL[caseData.status] || "neutral"}>
                    {CASE_STATUS_LABELS[caseData.status] || caseData.status}
                  </StatusPill>
                </div>

                <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="eyebrow text-graphite/60">amount at risk</div>
                    <div className="tnum wrap-id mt-1.5 text-4xl font-semibold leading-none text-graphite sm:text-5xl">
                      {formatCurrency(caseData.amount, caseData.currency)}
                    </div>
                    <div className="tnum wrap-id mt-2 text-[11px] text-graphite/70">
                      {caseData.payment_id} · opened {formatDateTime(caseData.created_at)}
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
                    <div className="min-w-0">
                      <div className="eyebrow text-graphite/60">failure</div>
                      <div className="mt-1.5 text-sm font-semibold text-graphite">
                        {FAILURE_LABELS[caseData.failure_type] ||
                          caseData.failure_type ||
                          "Unclassified"}
                      </div>
                      <div className="tnum wrap-prose mt-1 text-[11px] text-graphite/70">
                        {caseData.classification_method}
                        {caseData.classification_confidence != null &&
                          ` · ${formatPercent(caseData.classification_confidence)} confidence`}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="eyebrow text-graphite/60">recovery worthiness</div>
                      <div className="mt-1.5 text-sm font-semibold text-graphite">
                        {latestDecision
                          ? DECISION_WORTHINESS[latestDecision.decision] ||
                            latestDecision.decision.replace(/_/g, " ")
                          : "Not yet evaluated"}
                      </div>
                      {latestDecision && (
                        <div className="tnum mt-1 text-[11px] text-graphite/70">
                          {formatPercent(latestDecision.confidence)} confidence · latest pass
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              {/* --------------------------------------------- context band */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-rule bg-paper-alt px-5 py-4 sm:grid-cols-4 sm:px-7">
                <Fact
                  label="customer success rate"
                  value={`${Math.round(caseData.customer_success_rate * 100)}%`}
                />
                <Fact label="previous failures" value={caseData.previous_failures} />
                <Fact label="recovery attempts" value={caseData.previous_recovery_attempts} />
                <Fact
                  label="opportunities left"
                  value={caseData.remaining_recovery_opportunities}
                />
                <Fact label="customer engagement" value={caseData.customer_engagement} />
                <Fact
                  label="time since failure"
                  value={`${caseData.time_since_failure_minutes}m`}
                />
                <Fact label="source" value={caseData.source} />
                <Fact label="passes recorded" value={rounds.length} />
              </div>

              {/* ------------------------------------------------ the passes */}
              {rounds.length === 0 ? (
                <div className="px-5 py-8 text-sm text-graphite/70 sm:px-7">
                  No adjudication pass has run against this case yet.
                </div>
              ) : (
                rounds.map((round, i) => {
                  const overridden =
                    !!round.policy?.final_action &&
                    round.policy.final_action !== round.policy.proposed_action;
                  return (
                    <section key={i}>
                      <PassHeader index={i} round={round} overridden={overridden} />
                      <DecisionPanel decision={round.decision} />
                      <PolicyCheckPanel policy={round.policy} />
                      {round.execution && <ExecutionPanel execution={round.execution} />}
                      {round.outcome && <OutcomePanel outcome={round.outcome} />}
                    </section>
                  );
                })
              )}

              {/* ----------------------------------------------- settlement */}
              <footer className="border-t border-graphite/25 bg-paper-alt px-5 py-5 sm:px-7">
                <div className="rule-double flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 pt-3">
                  <div className="min-w-0">
                    <div className="eyebrow text-graphite/70">case settled as</div>
                    <div className="mt-1.5 text-lg font-semibold text-graphite">
                      {CASE_STATUS_LABELS[caseData.status] || caseData.status}
                      {overrideCount > 0 && (
                        <span className="ml-3 text-xs font-normal text-block">
                          {overrideCount} policy override{overrideCount > 1 ? "s" : ""} on record
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 text-right">
                    <div className="eyebrow text-graphite/70">revenue recovered</div>
                    <div
                      className={`tnum wrap-id mt-1.5 text-2xl font-semibold ${
                        caseData.revenue_recovered ? "text-approve-deep" : "text-graphite/70"
                      }`}
                    >
                      {caseData.revenue_recovered
                        ? formatCurrency(caseData.revenue_recovered, caseData.currency)
                        : "—"}
                    </div>
                    {caseData.revenue_recovered != null && (
                      <div className="mt-1 text-[11px] text-graphite/70">
                        {caseData.revenue_recovered_simulated
                          ? "Simulated financial outcome"
                          : "Real event"}
                      </div>
                    )}
                  </div>
                </div>
              </footer>
            </article>

            {/* The audit trail is a second document: the same events, but as
                the immutable log rather than the reasoned record. */}
            <Section title="Audit trail">
              <Timeline entries={caseData.audit_log} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
