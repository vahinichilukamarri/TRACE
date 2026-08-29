import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import AppShell from "../components/shell/AppShell";
import { LoadingState, ErrorState, EmptyState } from "../components/common/States";
import ComparisonMetric from "../components/trace/ComparisonMetric";
import ChartContainer from "../components/common/ChartContainer";
import { useEvalRun } from "../lib/EvalRunContext";
import { api } from "../lib/api";
import { formatINR, formatPct, formatNumber } from "../lib/format";
import { SIGNAL, FAILURE_LABEL, ACTION_LABEL } from "../lib/constants";

export default function Performance() {
  const { selectedRunId, loading: runsLoading } = useEvalRun();
  const [comparison, setComparison] = useState(null);
  const [failures, setFailures] = useState(null);
  const [decisions, setDecisions] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!selectedRunId) return;
    setError(null);
    try {
      const [c, f, d] = await Promise.all([
        api.comparison({ eval_run_id: selectedRunId }),
        api.failures({ eval_run_id: selectedRunId, system: "TRACE" }),
        api.decisions({ eval_run_id: selectedRunId, system: "TRACE" }),
      ]);
      setComparison(c);
      setFailures(f);
      setDecisions(d);
    } catch (e) {
      setError(e);
    }
  }, [selectedRunId]);

  useEffect(() => {
    load();
  }, [load]);

  if (runsLoading) return <AppShell title="Performance"><LoadingState label="Loading evaluation runs" /></AppShell>;

  if (!selectedRunId)
    return (
      <AppShell title="Performance" subtitle="TRACE vs Static Baseline">
        <EmptyState label="No evaluation run yet" detail="Click “Run Evaluation” in the top bar to generate a batch comparison." />
      </AppShell>
    );

  if (error) return <AppShell title="Performance"><ErrorState message="Could not load evaluation results" detail={error.message} onRetry={load} /></AppShell>;
  if (!comparison) return <AppShell title="Performance"><LoadingState label="Loading comparison" /></AppShell>;

  const t = comparison.TRACE;
  const b = comparison.BASELINE;

  const barData = [
    { name: "Revenue Recovered", TRACE: t.revenue_recovered, BASELINE: b.revenue_recovered },
  ];
  const rateData = [
    { name: "Recovery Rate", TRACE: t.recovery_rate * 100, BASELINE: b.recovery_rate * 100 },
  ];

  return (
    <AppShell title="Performance" subtitle="Proving the case: contextual, policy-controlled recovery vs a static workflow">
      <div className="space-y-8">
        {/* Hero comparison: recovery value per intervention */}
        <div className="border border-signal-orange/30 bg-signal-orange/[0.04] px-8 py-8">
          <div className="kicker !text-signal-orange">Recovery Value Per Intervention</div>
          <div className="mt-3 grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs font-medium text-signal-orange">TRACE</div>
              <div className="mono-num mt-1 text-5xl font-semibold text-obsidian">
                {formatINR(t.recovery_value_per_intervention, { compact: true })}
              </div>
              <div className="mt-1 text-xs text-obsidian/45">per approved recovery action</div>
            </div>
            <div>
              <div className="text-xs font-medium text-obsidian/40">Baseline</div>
              <div className="mono-num mt-1 text-5xl font-semibold text-obsidian/40">
                {formatINR(b.recovery_value_per_intervention, { compact: true })}
              </div>
              <div className="mt-1 text-xs text-obsidian/35">per action, no context awareness</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartContainer title="Revenue Recovered" sub="Simulated, same batch, matched randomness">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#D8D4C8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#11111180" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ fontSize: 12, border: "1px solid #D8D4C8", borderRadius: 0 }} />
                <Bar dataKey="TRACE" fill={SIGNAL.orange} barSize={28} />
                <Bar dataKey="BASELINE" fill="#D8D4C8" barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          <ChartContainer title="Recovery Rate" sub="% of failed payments ultimately recovered">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rateData} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#D8D4C8" horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: "#11111180" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} contentStyle={{ fontSize: 12, border: "1px solid #D8D4C8", borderRadius: 0 }} />
                <Bar dataKey="TRACE" fill={SIGNAL.orange} barSize={28} />
                <Bar dataKey="BASELINE" fill="#D8D4C8" barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* Full metric-by-metric comparison */}
        <div>
          <h2 className="mb-3 text-sm font-medium text-obsidian">Full Comparison</h2>
          <div className="panel px-5">
            <ComparisonMetric label="Revenue At Risk" traceValue={t.revenue_at_risk} baselineValue={b.revenue_at_risk} format={(v) => formatINR(v, { compact: true })} higherIsBetter={null} />
            <ComparisonMetric label="Recovery Actions Taken" traceValue={t.recovery_attempts} baselineValue={b.recovery_attempts} format={formatNumber} higherIsBetter={false} />
            <ComparisonMetric label="Transactions Recovered" traceValue={t.transactions_recovered} baselineValue={b.transactions_recovered} format={formatNumber} />
            <ComparisonMetric label="Revenue Recovered" traceValue={t.revenue_recovered} baselineValue={b.revenue_recovered} format={(v) => formatINR(v, { compact: true })} emphasize />
            <ComparisonMetric label="Recovery Rate" traceValue={t.recovery_rate} baselineValue={b.recovery_rate} format={(v) => formatPct(v)} />
            <ComparisonMetric label="Unnecessary Interventions" traceValue={t.unnecessary_interventions} baselineValue={b.unnecessary_interventions} format={formatNumber} higherIsBetter={false} />
            <ComparisonMetric label="Interventions Avoided" traceValue={t.interventions_avoided} baselineValue={b.interventions_avoided} format={formatNumber} />
            <ComparisonMetric label="Cases Stopped" traceValue={t.cases_stopped} baselineValue={b.cases_stopped} format={formatNumber} higherIsBetter={null} />
            <ComparisonMetric label="Cases Escalated" traceValue={t.cases_escalated} baselineValue={b.cases_escalated} format={formatNumber} higherIsBetter={null} />
            <ComparisonMetric label="Policy-Blocked Actions" traceValue={t.policy_blocked_actions} baselineValue={b.policy_blocked_actions} format={formatNumber} higherIsBetter={null} />
          </div>
          {t.revenue_recovered_is_simulated && (
            <p className="mt-2 text-[11px] text-obsidian/35">
              Revenue figures above are from a simulated batch evaluation — clearly labeled, never presented as real settled funds.
            </p>
          )}
        </div>

        {/* Supporting breakdowns */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartContainer title="Revenue At Risk By Failure Type" height={280}>
            {failures?.by_failure_type?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={failures.by_failure_type.map((f) => ({ ...f, label: FAILURE_LABEL[f.failure_type] || f.failure_type }))} margin={{ left: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#D8D4C8" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#11111180" }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11, fill: "#11111180" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatINR(v, { compact: true })} />
                  <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ fontSize: 12, border: "1px solid #D8D4C8", borderRadius: 0 }} />
                  <Bar dataKey="revenue_at_risk" radius={0}>
                    {failures.by_failure_type.map((_, i) => (
                      <Cell key={i} fill={SIGNAL.orange} fillOpacity={1 - i * 0.12} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No data" />
            )}
          </ChartContainer>

          <ChartContainer title="TRACE Actions Selected" height={280}>
            {decisions?.actions_selected?.length ? (
              <div className="flex h-full flex-col justify-center gap-3 px-3">
                {[...decisions.actions_selected]
                  .sort((a, b2) => b2.count - a.count)
                  .map((a) => {
                    const max = Math.max(...decisions.actions_selected.map((x) => x.count));
                    return (
                      <div key={a.action}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-obsidian/70">{ACTION_LABEL[a.action] || a.action}</span>
                          <span className="mono-num text-obsidian/45">{a.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-mist">
                          <div className="h-1.5" style={{ width: `${(a.count / max) * 100}%`, backgroundColor: SIGNAL.orange }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <EmptyState label="No data" />
            )}
          </ChartContainer>
        </div>
      </div>
    </AppShell>
  );
}
