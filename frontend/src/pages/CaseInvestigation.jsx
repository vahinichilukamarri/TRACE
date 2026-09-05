import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, MousePointerClick, RefreshCw, Ban } from "lucide-react";
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
  SIGNAL_CLASSES,
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

/**
 * Direct-selection stepper, numbered by iteration -- replaces scrolling
 * through every pass with jumping straight to one. Each tab carries the
 * pass's own signals rather than a bare index: a red dot for a policy
 * override (so an override is spottable without opening the pass), and the
 * case's real terminal signal on whichever tab is the last pass of a closed
 * case, so "recovered" reads as mint here the same way it does everywhere
 * else in the app.
 */
function PassTabs({ rounds, selected, onSelect, isTerminalCase, finalSignal }) {
  return (
    <div
      role="group"
      aria-label="Adjudication passes"
      className="flex flex-wrap gap-2 border-t border-graphite/25 bg-paper-alt px-5 py-3.5 sm:px-7"
    >
      {rounds.map((round, i) => {
        const isSelected = i === selected;
        const isFinalPass = isTerminalCase && i === rounds.length - 1;
        const finalCls = isFinalPass ? SIGNAL_CLASSES[finalSignal] || SIGNAL_CLASSES.neutral : null;
        const overridden =
          !!round.policy?.final_action && round.policy.final_action !== round.policy.proposed_action;

        return (
          <button
            key={i}
            type="button"
            aria-current={isSelected ? "step" : undefined}
            aria-label={`Pass ${i + 1} of ${rounds.length}, iteration ${round.iteration}${
              i === 0 ? ", initial assessment" : ", reassessment"
            }${isFinalPass ? ", final" : ""}${overridden ? ", policy overrode this pass" : ""}`}
            onClick={() => onSelect(i)}
            className={`relative flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-xs border px-3 py-2 transition-colors ${
              isSelected
                ? isFinalPass
                  ? `${finalCls.borderMuted} ${finalCls.dim}`
                  : "border-electric bg-electric/8"
                : "border-rule bg-paper-hi hover:border-graphite/45"
            }`}
          >
            {/* Override marker: a small block dot, visible whether or not the
                tab is selected -- scanning the row should surface it. */}
            {overridden && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-paper bg-block"
              />
            )}
            <span
              className={`tnum text-lg font-semibold leading-none ${
                isSelected ? (isFinalPass ? finalCls.text : "text-electric") : "text-graphite/75"
              }`}
            >
              {round.iteration}
            </span>
            <span
              className={`eyebrow leading-none ${
                isSelected ? (isFinalPass ? finalCls.text : "text-electric") : "text-graphite/55"
              }`}
            >
              {i === 0 ? "initial" : `reassess ${i}`}
            </span>
            {isFinalPass && (
              <span
                className={`eyebrow leading-none ${isSelected ? finalCls.text : "text-graphite/45"}`}
              >
                final
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function CaseInvestigation() {
  const { paymentId } = useParams();
  // The Recovery Cases queue links here with its current status/eval_run_id
  // filter carried on the URL (see RecoveryCases.jsx), using the same param
  // names that page itself reads -- so forwarding this query string straight
  // back to /cases reproduces exactly the filtered view the case was opened
  // from. A direct visit (search jump, simulate dialog, dashboard card) has
  // no such params, so the fallback is the plain unscoped route.
  const [searchParams] = useSearchParams();
  const backQuery = searchParams.toString();
  const backTo = backQuery ? `/cases?${backQuery}` : "/cases";
  const [actionPending, setActionPending] = useState(false);
  // null means "follow the newest pass" -- an explicit number means the
  // viewer jumped somewhere on purpose and a background refresh (e.g. the
  // link-click action, which doesn't add a pass) shouldn't yank them away.
  const [selectedPass, setSelectedPass] = useState(null);

  const fetcher = useCallback(() => api.getCase(paymentId), [paymentId]);
  const { data: caseData, loading, error, refresh } = useApi(fetcher, [paymentId]);

  // A different case is a different set of passes -- start it on the newest
  // one rather than carrying over a tab index from whatever was open before.
  useEffect(() => {
    setSelectedPass(null);
  }, [paymentId]);

  const { activeIndex, finalSignal, reassessed } = deriveTraceStage(caseData);
  const rounds = groupCaseIterations(caseData);
  const latestDecision = caseData?.decisions?.[caseData.decisions.length - 1];
  const isTerminal = caseData && caseData.status !== "OPEN";
  // Clamp rather than trust the stored index: a case with fewer passes than
  // whatever was last selected (a fresh case load) still needs a valid pass.
  const passIndex =
    rounds.length === 0 ? 0 : Math.min(selectedPass ?? rounds.length - 1, rounds.length - 1);
  const selectedRound = rounds[passIndex];

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
      // A reassessment appends a new pass -- jump to it rather than leaving
      // the viewer looking at what is now a stale one.
      setSelectedPass(null);
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
        back={
          <Link
            to={backTo}
            className="eyebrow mb-3 inline-flex w-fit items-center gap-1.5 text-cream-dim transition-colors hover:text-electric-bright"
          >
            <ArrowLeft className="h-3 w-3 shrink-0" strokeWidth={2} />
            back to recovery cases
          </Link>
        }
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

              {/* ------------------------------------------------ the passes
                  Direct selection, not scroll: the tabs jump straight to one
                  pass's full record -- engine, proposal, economics, policy,
                  execution, outcome -- exactly as it rendered before, just
                  one at a time instead of all stacked. */}
              {rounds.length === 0 ? (
                <div className="px-5 py-8 text-sm text-graphite/70 sm:px-7">
                  No adjudication pass has run against this case yet.
                </div>
              ) : (
                <>
                  <PassTabs
                    rounds={rounds}
                    selected={passIndex}
                    onSelect={setSelectedPass}
                    isTerminalCase={isTerminal}
                    finalSignal={finalSignal}
                  />
                  {selectedRound && (
                    <section key={passIndex}>
                      <PassHeader
                        index={passIndex}
                        round={selectedRound}
                        overridden={
                          !!selectedRound.policy?.final_action &&
                          selectedRound.policy.final_action !== selectedRound.policy.proposed_action
                        }
                      />
                      <DecisionPanel decision={selectedRound.decision} />
                      <PolicyCheckPanel policy={selectedRound.policy} />
                      {selectedRound.execution && <ExecutionPanel execution={selectedRound.execution} />}
                      {selectedRound.outcome && <OutcomePanel outcome={selectedRound.outcome} />}
                    </section>
                  )}
                </>
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
