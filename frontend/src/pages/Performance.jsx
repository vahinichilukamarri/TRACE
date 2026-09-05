import { useCallback, useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { RunSelector } from "@/components/RunSelector";
import { RecoveryRace } from "@/components/RecoveryRace";
import { ComparisonMetric } from "@/components/ComparisonMetric";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { formatCompactCurrency, formatCurrency, formatPercentFromWhole } from "@/lib/format";

/*
 * The evidence, in the order a sceptic would want it: how much effort buys, a
 * race showing TRACE buying more with the same effort, the work it correctly
 * never did, where the money ended up, and then the full table for anyone who
 * wants to audit the claim.
 *
 * Both charts here are drawn by hand rather than by a chart library: they carry
 * the ledger's own palette and, more importantly, they are shaped so the point
 * lands before any axis label is read.
 */

/** One bar in the revenue split -- a share of a pot, not an abstract quantity. */
function ShareBar({ label, value, total, tone, delay = 0 }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const isTrace = tone === "trace";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-rule py-4 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_9rem]">
      <div className={`eyebrow ${isTrace ? "text-approve-deep" : "text-graphite/70"}`}>{label}</div>

      <div className="col-span-2 h-7 overflow-hidden rounded-xs bg-graphite/10 sm:col-span-1">
        <div
          className={`bar-grow h-full rounded-r-xs ${
            isTrace ? "bg-gradient-to-r from-approve to-approve-deep" : "bg-graphite/50"
          }`}
          style={{ width: `${pct}%`, animationDelay: `${delay}ms` }}
        />
      </div>

      <div className="text-right">
        <div
          className={`tnum wrap-id text-lg font-semibold ${
            isTrace ? "text-approve-deep" : "text-graphite/80"
          }`}
        >
          {formatCompactCurrency(value)}
        </div>
        <div className="tnum text-[11px] text-graphite/70">
          {pct.toFixed(1)}% of the pot recovered
        </div>
      </div>
    </div>
  );
}

export default function Performance() {
  const [selectedRun, setSelectedRun] = useState(null);

  // Default the view to the most recent run once the runs list loads.
  const runsFetcher = useCallback(() => api.listEvaluationRuns(1), []);
  const { data: latestRun } = useApi(runsFetcher, []);
  useEffect(() => {
    if (selectedRun == null && latestRun && latestRun.length > 0) {
      setSelectedRun(latestRun[0].run_id);
    }
  }, [latestRun, selectedRun]);

  // Both take the run id positionally; a null id falls back to the latest
  // completed run on the backend.
  const fetcher = useCallback(() => api.getComparison(selectedRun), [selectedRun]);
  const { data, loading, error, refresh } = useApi(fetcher, [selectedRun]);

  const frontierFetcher = useCallback(() => api.getFrontier(selectedRun), [selectedRun]);
  const { data: frontier } = useApi(frontierFetcher, [selectedRun]);

  const noRunYet = error && error.status === 404;

  if (loading) {
    return (
      <div className="px-6 py-8 sm:px-8">
        <LoadingState label="Loading performance data" />
      </div>
    );
  }

  if (noRunYet) {
    return (
      <div className="px-6 py-8 sm:px-8">
        <EmptyState
          icon={Zap}
          title="No evaluation run yet"
          description="Run a batch evaluation from the Command Center to generate a TRACE vs Baseline comparison."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-8 sm:px-8">
        <ErrorState description={error.message} onRetry={refresh} />
      </div>
    );
  }

  const trace = data?.TRACE;
  const baseline = data?.BASELINE;
  if (!trace || !baseline) return null;

  const efficiencyImproved =
    trace.recovery_value_per_intervention >= baseline.recovery_value_per_intervention;
  const efficiencyDelta = baseline.recovery_value_per_intervention
    ? Math.abs(
        ((trace.recovery_value_per_intervention - baseline.recovery_value_per_intervention) /
          baseline.recovery_value_per_intervention) *
          100
      ).toFixed(1)
    : null;

  const revenueEdge = trace.revenue_recovered - baseline.revenue_recovered;

  return (
    <div>
      <PageHeader
        eyebrow="Performance"
        title="TRACE vs static baseline"
        description="The same batch of synthetic cases, run through TRACE's contextual agent and through a fixed failure-type → action baseline."
        action={<RunSelector value={selectedRun} onChange={setSelectedRun} />}
      />

      <div className="space-y-10 px-6 py-8 sm:px-8">
        {/* ------------------------------- what one intervention is worth */}
        <div className="record p-6 sm:p-7">
          <div className="eyebrow text-graphite/60">/ recovery value per intervention</div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            <span className="tnum wrap-id text-4xl font-semibold leading-none text-graphite sm:text-5xl">
              {formatCurrency(trace.recovery_value_per_intervention)}
            </span>
            <span className="tnum text-sm text-graphite/70">
              vs {formatCurrency(baseline.recovery_value_per_intervention)} baseline
            </span>
            {efficiencyDelta && (
              <span
                className={`tnum rounded-xs px-2.5 py-1 text-sm font-semibold ${
                  efficiencyImproved
                    ? "bg-approve-soft text-approve-deep"
                    : "bg-block-soft text-block-deep"
                }`}
              >
                {efficiencyImproved ? "▲" : "▼"} {efficiencyDelta}%
              </span>
            )}
          </div>
          <div className="rule-double mt-5 pt-3">
            <p className="wrap-prose max-w-3xl text-sm leading-relaxed text-graphite/80">
              Every recovery action TRACE takes brings back{" "}
              {formatCurrency(trace.recovery_value_per_intervention)} on average. The baseline
              spends the same kind of action and gets back{" "}
              {formatCurrency(baseline.recovery_value_per_intervention)}.
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------ the race */}
        {frontier?.TRACE && frontier?.BASELINE && (
          <Section title="Effort against return">
            <RecoveryRace frontier={frontier} />
          </Section>
        )}

        {/* --------------------------------------------------- the thesis */}
        <Section title="The thesis">
          <div className="record p-6 sm:p-8">
            <div className="eyebrow text-graphite/60">/ cases correctly never pursued</div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="tnum bg-gradient-to-br from-approve to-approve-deep bg-clip-text text-6xl font-bold leading-none text-transparent sm:text-7xl">
                {trace.interventions_avoided}
              </span>
              <span className="text-lg text-graphite/70">versus</span>
              <span className="tnum text-4xl font-semibold leading-none text-graphite/70 sm:text-5xl">
                {baseline.interventions_avoided}
              </span>
              <span className="text-sm text-graphite/70">for the baseline</span>
            </div>
            <p className="wrap-prose mt-5 max-w-[62ch] text-[15px] leading-[1.75] text-graphite/80">
              TRACE recovered more revenue while declining to touch{" "}
              <span className="tnum font-semibold text-graphite">
                {trace.interventions_avoided}
              </span>{" "}
              cases the baseline chased anyway. The thesis is not that the agent chases harder — it
              is that effort concentrates where it pays, and the clearest evidence of judgment is
              the work correctly left undone.
            </p>
          </div>
        </Section>

        {/* ------------------------------------------- where the money went */}
        <Section title="Revenue recovered">
          <div className="record overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 pb-2 pt-4 sm:px-6">
              <span className="eyebrow text-graphite/60">/ out of the same pot at risk</span>
              <span className="tnum text-sm font-semibold text-graphite">
                {formatCompactCurrency(trace.revenue_at_risk)} at risk ·{" "}
                {trace.total_failed_payments} failed payments
              </span>
            </div>
            <div className="rule-double mx-4 sm:mx-6">
              <ShareBar
                label="TRACE"
                value={trace.revenue_recovered}
                total={trace.revenue_at_risk}
                tone="trace"
              />
              <ShareBar
                label="Baseline"
                value={baseline.revenue_recovered}
                total={baseline.revenue_at_risk}
                tone="baseline"
                delay={160}
              />
            </div>
            <p className="wrap-prose px-4 pb-4 pt-3 text-sm leading-relaxed text-graphite/80 sm:px-6">
              TRACE returned{" "}
              <span className="tnum font-semibold text-approve-deep">
                {formatCompactCurrency(revenueEdge)}
              </span>{" "}
              more than the baseline from the identical set of failed payments.
            </p>
          </div>
        </Section>

        {/* ------------------------------------------- the auditable table */}
        <Section title="Full evaluation comparison">
          <div className="record px-4 sm:px-6">
            <ComparisonMetric
              label="Total failed payments"
              baselineValue={baseline.total_failed_payments}
              traceValue={trace.total_failed_payments}
              better="none"
            />
            <ComparisonMetric
              label="Revenue at risk"
              baselineValue={formatCurrency(baseline.revenue_at_risk)}
              traceValue={formatCurrency(trace.revenue_at_risk)}
              better="none"
            />
            <ComparisonMetric
              label="Recovery actions taken"
              baselineValue={baseline.recovery_attempts}
              traceValue={trace.recovery_attempts}
              better="lower"
            />
            <ComparisonMetric
              label="Transactions recovered"
              baselineValue={baseline.transactions_recovered}
              traceValue={trace.transactions_recovered}
              better="higher"
            />
            <ComparisonMetric
              label="Revenue recovered"
              baselineValue={formatCurrency(baseline.revenue_recovered)}
              traceValue={formatCurrency(trace.revenue_recovered)}
              better="higher"
              highlight
            />
            <ComparisonMetric
              label="Recovery rate"
              baselineValue={formatPercentFromWhole(baseline.recovery_rate * 100)}
              traceValue={formatPercentFromWhole(trace.recovery_rate * 100)}
              better="higher"
              highlight
            />
            <ComparisonMetric
              label="Unnecessary interventions"
              baselineValue={baseline.unnecessary_interventions}
              traceValue={trace.unnecessary_interventions}
              better="lower"
            />
            <ComparisonMetric
              label="Interventions avoided"
              baselineValue={baseline.interventions_avoided}
              traceValue={trace.interventions_avoided}
              better="higher"
            />
            <ComparisonMetric
              label="Cases stopped"
              baselineValue={baseline.cases_stopped}
              traceValue={trace.cases_stopped}
              better="none"
            />
            <ComparisonMetric
              label="Cases escalated"
              baselineValue={baseline.cases_escalated}
              traceValue={trace.cases_escalated}
              better="none"
            />
            <ComparisonMetric
              label="Policy-blocked actions"
              baselineValue={baseline.policy_blocked_actions}
              traceValue={trace.policy_blocked_actions}
              better="none"
            />
            <ComparisonMetric
              label="Recovery value per intervention"
              baselineValue={formatCurrency(baseline.recovery_value_per_intervention)}
              traceValue={formatCurrency(trace.recovery_value_per_intervention)}
              better="higher"
              highlight
            />
          </div>
        </Section>

        <p className="text-[11px] text-cream-dim">
          Revenue figures are simulated financial outcomes from the evaluation harness, not real
          transactions.
        </p>
      </div>
    </div>
  );
}
