import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Zap, ShieldAlert, PlusCircle, ArrowRight } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { KpiBlock } from "@/components/KpiBlock";
import { RecoveryFlow } from "@/components/RecoveryFlow";
import { CaseCard } from "@/components/CaseCard";
import { Button } from "@/components/Button";
import { RunSelector } from "@/components/RunSelector";
import { SimulateFailureDialog } from "@/components/SimulateFailureDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { formatCompactCurrency, formatPercent } from "@/lib/format";

/*
 * The desk, first thing in the morning: two figures that matter, everything
 * else deliberately quieter. Revenue at risk and revenue recovered are set as
 * full cream records; the supporting statistics share one banded record below
 * them, so the hierarchy is carried by surface and scale rather than by colour.
 */

/** A run banner on the dark ground -- chrome reporting on the app, not a record. */
function RunNotice({ tone = "neutral", children }) {
  const tones = {
    busy: "border-electric-bright/35 bg-electric-bright/8 text-electric-bright",
    done: "border-approve-bright/35 bg-approve-bright/8 text-approve-bright",
  };
  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xs border px-4 py-2.5 text-[11px] leading-relaxed ${
        tones[tone] || "border-void-line text-cream-dim"
      }`}
    >
      {children}
    </div>
  );
}

export default function CommandCenter() {
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [simulateOpen, setSimulateOpen] = useState(false);
  // Bumped after a run completes so RunSelector refetches its list.
  const [runsToken, setRunsToken] = useState(0);

  // Default the view to the most recent run once the runs list loads.
  const runsFetcher = useCallback(() => api.listEvaluationRuns(1), []);
  const { data: latestRun, refresh: refreshRuns } = useApi(runsFetcher, []);
  useEffect(() => {
    if (selectedRun == null && latestRun && latestRun.length > 0) {
      setSelectedRun(latestRun[0].run_id);
    }
  }, [latestRun, selectedRun]);

  // eval_run_id is dropped from the query string while null, and the backend
  // already defaults to the latest completed run in that case.
  const fetchOverview = useCallback(
    () => api.getOverview({ system: "TRACE", eval_run_id: selectedRun }),
    [selectedRun]
  );
  const { data: overview, loading, error, refresh } = useApi(fetchOverview, [selectedRun]);

  const fetchAttentionCases = useCallback(
    () => api.listCases({ status: "ESCALATED", system: "TRACE", eval_run_id: selectedRun, limit: 4 }),
    [selectedRun]
  );
  const { data: attentionCases, refresh: refreshAttention } = useApi(fetchAttentionCases, [selectedRun]);

  const noRunYet = error && error.status === 404;

  const refreshAll = useCallback(
    () => Promise.allSettled([refresh(), refreshAttention()]),
    [refresh, refreshAttention]
  );

  const pollRef = useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleRunEvaluation = async () => {
    setRunning(true);
    setRunError(null);
    // A 300-case batch is a long synchronous request. Poll while it runs so
    // the page catches up even if the request connection drops before it
    // returns -- previously the numbers only updated on a full remount
    // (i.e. after navigating away and back).
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { refreshAll(); }, 5000);
    try {
      // No seed -> the backend picks a fresh random one, so each click really is
      // a new batch. (Sending a fixed seed replays an identical dataset, which
      // makes a completed run look like nothing happened.)
      const result = await api.runEvaluation({ dataset_size: 300 });
      setLastRun(result);
      // Point the view at the run just produced. Changing selectedRun is what
      // drives the overview + attention refetch, because both fetchers key on
      // it -- so do NOT also call refreshAll() here: that closure is still
      // bound to the PREVIOUS run id and would race the deps-driven fetch,
      // sometimes overwriting the new metrics with the old run's numbers.
      setRunsToken((t) => t + 1);
      if (result?.run_id) setSelectedRun(result.run_id);
      await refreshRuns();
    } catch (e) {
      setRunError(e.message || "Evaluation run failed.");
      // Nothing changed, so nothing refetches on its own -- refresh explicitly.
      await refreshAll();
    } finally {
      clearInterval(pollRef.current);
      setRunning(false);
    }
  };

  const inProgress = overview
    ? overview.total_failed_payments -
      overview.transactions_recovered -
      overview.cases_stopped -
      overview.cases_escalated
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Command center"
        title="Revenue recovery, live"
        description="How much revenue is at risk, what TRACE has recovered, and which cases need a human."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RunSelector
              value={selectedRun}
              onChange={setSelectedRun}
              refreshToken={runsToken}
            />
            <Button onClick={() => setSimulateOpen(true)}>
              <PlusCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              Simulate failed payment
            </Button>
            <Button variant="secondary" onClick={handleRunEvaluation} disabled={running}>
              <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
              {running ? "Running evaluation…" : "Run new evaluation"}
            </Button>
          </div>
        }
      />

      <div className="space-y-10 px-6 py-8 sm:px-8">
        {running && (
          <RunNotice tone="busy">
            <span className="eyebrow">/ evaluation running</span>
            <span className="text-cream-dim">
              A 300-case batch is being scored against the baseline — this can take up to a minute.
              The figures below refresh as it progresses.
            </span>
          </RunNotice>
        )}
        {runError && (
          <ErrorState
            title="Evaluation run failed"
            description={runError}
            onRetry={handleRunEvaluation}
          />
        )}
        {!running && lastRun && (
          <RunNotice tone="done">
            <span className="eyebrow">/ run complete</span>
            <span className="tnum text-cream-dim">
              id <span className="text-cream">{String(lastRun.run_id).slice(0, 8)}</span>
            </span>
            <span className="tnum text-cream-dim">
              seed <span className="text-cream">{lastRun.seed}</span>
            </span>
            <span className="tnum text-cream-dim">
              recovered{" "}
              <span className="text-cream">
                {lastRun.results?.TRACE?.transactions_recovered} /{" "}
                {lastRun.results?.TRACE?.total_failed_payments}
              </span>
            </span>
          </RunNotice>
        )}

        {loading && <LoadingState label="Loading command center" />}

        {noRunYet && (
          <EmptyState
            icon={Zap}
            title="No evaluation run yet"
            description="TRACE has nothing to show until a batch of synthetic recovery cases has been evaluated against the baseline."
            action={
              <Button onClick={handleRunEvaluation} disabled={running}>
                {running ? "Running…" : "Run first evaluation"}
              </Button>
            }
          />
        )}

        {error && !noRunYet && <ErrorState description={error.message} onRetry={refresh} />}

        {overview && (
          <>
            {/* ------------------------------------------- the two headlines */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="record p-6 sm:p-7">
                <KpiBlock
                  hero
                  label="Revenue at risk"
                  value={formatCompactCurrency(overview.revenue_at_risk)}
                  sublabel={`${overview.total_failed_payments} failed payments in this run`}
                />
              </div>
              <div className="record p-6 sm:p-7">
                <KpiBlock
                  hero
                  label="Revenue recovered"
                  value={formatCompactCurrency(overview.revenue_recovered)}
                  signal="mint"
                  sublabel={`${overview.transactions_recovered} of ${overview.total_failed_payments} transactions · simulated financial outcome`}
                />
              </div>
            </div>

            {/* --------------------------------- supporting figures, quieter */}
            <div className="record grid divide-y divide-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-5">
                <KpiBlock
                  label="Recovery rate"
                  value={formatPercent(overview.recovery_rate)}
                  sublabel={`${overview.recovery_attempts} recovery actions taken`}
                />
              </div>
              <div className="p-5">
                <KpiBlock
                  label="Cases requiring review"
                  value={overview.cases_escalated}
                  signal={overview.cases_escalated > 0 ? "amber" : undefined}
                  sublabel="Escalated for human judgment"
                />
              </div>
              <div className="p-5">
                <KpiBlock
                  label="Recovery efficiency"
                  value={formatCompactCurrency(overview.recovery_value_per_intervention)}
                  sublabel="Recovered value per intervention"
                />
              </div>
            </div>

            {/* --------------------------------------------- live case flow */}
            <Section title="Live recovery flow">
              <div className="record h-56 p-6">
                <RecoveryFlow
                  total={overview.total_failed_payments}
                  open={inProgress}
                  recovered={overview.transactions_recovered}
                  stopped={overview.cases_stopped}
                  escalated={overview.cases_escalated}
                />
              </div>
            </Section>

            {/* ------------------------------------------ needs a human now */}
            <Section
              title="Cases needing attention"
              action={
                <Link
                  to={`/cases?status=ESCALATED${selectedRun ? `&eval_run_id=${selectedRun}` : ""}`}
                  className="eyebrow inline-flex items-center gap-1.5 text-electric-bright hover:underline"
                >
                  view all escalated
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              }
            >
              {attentionCases && attentionCases.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {attentionCases.map((c) => (
                    <CaseCard key={c.payment_id} caseData={c} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ShieldAlert}
                  title="Nothing escalated right now"
                  description="TRACE is resolving cases within policy without needing a human decision."
                />
              )}
            </Section>
          </>
        )}
      </div>

      {simulateOpen && <SimulateFailureDialog onClose={() => setSimulateOpen(false)} />}
    </div>
  );
}
