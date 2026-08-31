import { useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { ChartContainer } from "@/components/ChartContainer";
import { ComparisonMetric } from "@/components/ComparisonMetric";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { formatCompactCurrency, formatCurrency, formatPercentFromWhole } from "@/lib/format";
import { Zap } from "lucide-react";

const TOOLTIP_STYLE = {
  background: "#1A1A1A",
  border: "1px solid #2A2A28",
  fontSize: 11,
  fontFamily: "IBM Plex Mono, monospace",
  color: "#F5F2EA",
};

export default function Performance() {
  const fetcher = useCallback(() => api.getComparison(), []);
  const { data, loading, error, refresh } = useApi(fetcher, []);

  const frontierFetcher = useCallback(() => api.getFrontier(), []);
  const { data: frontier } = useApi(frontierFetcher, []);

  const noRunYet = error && error.status === 404;

  if (loading) return <div className="px-8 py-8"><LoadingState label="Loading performance data" /></div>;

  if (noRunYet) {
    return (
      <div className="px-8 py-8">
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
      <div className="px-8 py-8">
        <ErrorState description={error.message} onRetry={refresh} />
      </div>
    );
  }

  const trace = data?.TRACE;
  const baseline = data?.BASELINE;
  if (!trace || !baseline) return null;

  const revenueChartData = [
    { name: "Revenue at risk", Baseline: baseline.revenue_at_risk, TRACE: trace.revenue_at_risk },
    { name: "Revenue recovered", Baseline: baseline.revenue_recovered, TRACE: trace.revenue_recovered },
  ];

  const efficiencyImproved = trace.recovery_value_per_intervention >= baseline.recovery_value_per_intervention;

  return (
    <div>
      <PageHeader
        eyebrow="Performance"
        title="TRACE vs static baseline"
        description="The same batch of synthetic cases, run through TRACE's contextual agent and through a fixed failure-type → action baseline."
      />

      <div className="px-8 py-8 space-y-10">
        {/* Hero: recovery value per intervention */}
        <Section>
          <div className="border border-signal-orange/30 bg-signal-orange-dim/5 p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-signal-orange mb-2">
                Recovery value per intervention
              </div>
              <div className="mono-tabular text-5xl font-semibold text-bone">
                {formatCurrency(trace.recovery_value_per_intervention)}
              </div>
              <div className="text-xs text-ink-faint font-mono mt-2">
                vs {formatCurrency(baseline.recovery_value_per_intervention)} baseline
              </div>
            </div>
            <div
              className={`text-sm font-mono px-4 py-2 border ${
                efficiencyImproved
                  ? "border-signal-mint/40 text-signal-mint bg-signal-mint-dim/10"
                  : "border-signal-red/40 text-signal-red bg-signal-red-dim/10"
              }`}
            >
              {efficiencyImproved ? "▲" : "▼"}{" "}
              {baseline.recovery_value_per_intervention
                ? Math.abs(
                    ((trace.recovery_value_per_intervention - baseline.recovery_value_per_intervention) /
                      baseline.recovery_value_per_intervention) *
                      100
                  ).toFixed(1)
                : "—"}
              % vs baseline
            </div>
          </div>
        </Section>

        {/* Revenue comparison chart */}
        <Section title="Revenue at risk vs recovered">
          <ChartContainer title="Revenue (₹)" subtitle="Baseline vs TRACE, same evaluation batch">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData} barGap={6}>
                <CartesianGrid strokeDasharray="2 4" stroke="#2A2A28" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#8A8781", fontSize: 11, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#2A2A28" }} tickLine={false} />
                <YAxis tick={{ fill: "#8A8781", fontSize: 11, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="Baseline" fill="#8A8781" radius={[2, 2, 0, 0]} />
                <Bar dataKey="TRACE" fill="#FF6B35" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Section>

        {/* Recovery efficiency frontier */}
        {frontier?.TRACE && frontier?.BASELINE && (
          <Section title="Recovery efficiency frontier">
            <p className="text-xs text-ink-faint leading-relaxed max-w-3xl mb-4">
              Cumulative revenue recovered as interventions accumulate, with each system's
              best-value cases spent first. A curve that climbs faster per intervention is
              recovering more revenue for the same amount of effort — the visual proof of TRACE's
              "maximize intelligent effort, not attempt count" thesis.
            </p>
            <ChartContainer
              title="Cumulative revenue recovered (₹)"
              subtitle="By cumulative interventions — best value density first"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <CartesianGrid strokeDasharray="2 4" stroke="#2A2A28" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="interventions"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "#8A8781", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                    axisLine={{ stroke: "#2A2A28" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#8A8781", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompactCurrency(v)}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                  <Line
                    data={frontier.BASELINE}
                    dataKey="revenue_recovered"
                    name="Baseline"
                    stroke="#8A8781"
                    type="stepAfter"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    data={frontier.TRACE}
                    dataKey="revenue_recovered"
                    name="TRACE"
                    stroke="#FF6B35"
                    type="stepAfter"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </Section>
        )}

        {/* Full metric comparison */}
        <Section title="Full evaluation comparison">
          <div className="border border-obsidian-line bg-obsidian-soft px-4">
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

        <div className="text-[11px] font-mono text-ink-faint">
          Revenue figures are simulated financial outcomes from the evaluation harness, not real transactions.
        </div>
      </div>
    </div>
  );
}
