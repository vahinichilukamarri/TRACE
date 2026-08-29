import { useCallback, useState } from "react";
import { Zap, ShieldAlert } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader, Section } from "@/components/Page";
import { KpiBlock } from "@/components/KpiBlock";
import { RecoveryFlow } from "@/components/RecoveryFlow";
import { CaseCard } from "@/components/CaseCard";
import { Button } from "@/components/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/States";
import { formatCompactCurrency, formatPercent } from "@/lib/format";

export default function CommandCenter() {
  const [running, setRunning] = useState(false);

  const fetchOverview = useCallback(() => api.getOverview({ system: "TRACE" }), []);
  const { data: overview, loading, error, refresh } = useApi(fetchOverview, []);

  const fetchAttentionCases = useCallback(
    () => api.listCases({ status: "ESCALATED", system: "TRACE", limit: 4 }),
    []
  );
  const { data: attentionCases } = useApi(fetchAttentionCases, []);

  const noRunYet = error && error.status === 404;

  const handleRunEvaluation = async () => {
    setRunning(true);
    try {
      await api.runEvaluation({ dataset_size: 300 });
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
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
          <Button variant="secondary" onClick={handleRunEvaluation} disabled={running}>
            <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
            {running ? "Running evaluation…" : "Run new evaluation"}
          </Button>
        }
      />

      <div className="px-8 py-8 space-y-10">
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
                <a href="/cases?status=ESCALATED" className="text-[11px] font-mono text-signal-orange hover:underline">
                  View all escalated →
                </a>
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
