import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Zap, ShieldAlert } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { KpiBlock } from "@/components/KpiBlock";
import { RecoveryFlow } from "@/components/RecoveryFlow";
import { CaseCard } from "@/components/CaseCard";
import { Button } from "@/components/Button";
import { RunSelector } from "@/components/RunSelector";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { formatCompactCurrency, formatPercent } from "@/lib/format";

export default function CommandCenter() {
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);

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
      // Point the view at the run just produced, and refresh the dropdown so
      // the new run appears in it.
      if (result?.run_id) setSelectedRun(result.run_id);
      await refreshRuns();
    } catch (e) {
      setRunError(e.message || "Evaluation run failed.");
    } finally {
      clearInterval(pollRef.current);
      await refreshAll();
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Command center"
        title="Revenue recovery, live"
        description="How much revenue is at risk, what TRACE has recovered, and which cases need a human."
        action={
          <div className="flex items-center gap-2">
            <RunSelector value={selectedRun} onChange={setSelectedRun} />
            <Button variant="secondary" onClick={handleRunEvaluation} disabled={running}>
              <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
              {running ? "Running evaluation…" : "Run new evaluation"}
            </Button>
          </div>
        }
      />

      <div className="px-8 py-8 space-y-10">
        {running && (
          <div className="text-[11px] font-mono text-signal-orange border border-signal-orange/30 bg-signal-orange-dim/5 px-4 py-2">
            Running a 300-case evaluation against the baseline — this can take up to a minute.
            The figures below refresh automatically as it progresses.
          </div>
        )}
        {runError && (
          <ErrorState
            title="Evaluation run failed"
            description={runError}
            onRetry={handleRunEvaluation}
          />
        )}
        {!running && lastRun && (
          <div className="text-[11px] font-mono text-signal-mint border border-signal-mint/30 bg-signal-mint-dim/10 px-4 py-2 flex flex-wrap gap-x-5 gap-y-1">
            <span>Run complete</span>
            <span className="text-ink-faint">
              id <span className="text-bone">{String(lastRun.run_id).slice(0, 8)}</span>
            </span>
            <span className="text-ink-faint">
              seed <span className="text-bone">{lastRun.seed}</span>
            </span>
            <span className="text-ink-faint">
              recovered{" "}
              <span className="text-bone">
                {lastRun.results?.TRACE?.transactions_recovered} / {lastRun.results?.TRACE?.total_failed_payments}
              </span>
            </span>
          </div>
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

        {error && !noRunYet && (
          <ErrorState description={error.message} onRetry={refresh} />
        )}

        {overview && (
          <>
            {/* Hero + supporting KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10">
              <KpiBlock
                hero
                label="Revenue at risk"
                value={formatCompactCurrency(overview.revenue_at_risk)}
                signal="orange"
                sublabel={`${overview.total_failed_payments} failed payments in current run`}
              />
              <div className="grid grid-cols-2 gap-6 content-center">
                <KpiBlock
                  label="Revenue recovered"
                  value={formatCompactCurrency(overview.revenue_recovered)}
                  signal="mint"
                  sublabel="Simulated outcome"
                />
                <KpiBlock
                  label="Recovery rate"
                  value={formatPercent(overview.recovery_rate)}
                  sublabel={`${overview.recovery_attempts} attempts made`}
                />
                <KpiBlock
                  label="Cases requiring review"
                  value={overview.cases_escalated}
                  signal={overview.cases_escalated > 0 ? "amber" : undefined}
                  sublabel="Escalated for human judgment"
                />
                <KpiBlock
                  label="Recovery efficiency"
                  value={formatCompactCurrency(overview.recovery_value_per_intervention)}
                  sublabel="Recovered value per intervention"
                />
              </div>
            </div>

            {/* Live recovery flow */}
            <Section title="Live recovery flow">
              <div className="border border-obsidian-line bg-obsidian-soft p-6 h-56">
                <RecoveryFlow
                  total={overview.total_failed_payments}
                  open={
                    overview.total_failed_payments -
                    overview.transactions_recovered -
                    overview.cases_stopped -
                    overview.cases_escalated
                  }
                  recovered={overview.transactions_recovered}
                  stopped={overview.cases_stopped}
                  escalated={overview.cases_escalated}
                />
              </div>
            </Section>

            {/* Cases needing attention */}
            <Section
              title="Cases needing attention"
              action={
                <Link
                  to={`/cases?status=ESCALATED${selectedRun ? `&eval_run_id=${selectedRun}` : ""}`}
                  className="text-[11px] font-mono text-signal-orange hover:underline"
                >
                  View all escalated →
                </Link>
              }
            >
              {attentionCases && attentionCases.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    </div>
  );
}
