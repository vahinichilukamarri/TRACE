import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/shell/AppShell";
import KpiBlock from "../components/common/KpiBlock";
import { LoadingState, ErrorState, EmptyState } from "../components/common/States";
import LiveRecoveryFlow from "../components/cases/LiveRecoveryFlow";
import StatusIndicator from "../components/common/StatusIndicator";
import { api } from "../lib/api";
import { formatINR, formatPct, formatRelative } from "../lib/format";
import { CASE_STATUS_COLOR, CASE_STATUS_LABEL, FAILURE_LABEL, SIGNAL } from "../lib/constants";

export default function CommandCenter() {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.listCases({ source: "live", limit: 200 });
      setCases(data);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <AppShell title="Command Center"><ErrorState message="Could not reach TRACE backend" detail={error.message} onRetry={load} /></AppShell>;
  if (cases === null) return <AppShell title="Command Center"><LoadingState label="Loading live recovery state" /></AppShell>;

  const open = cases.filter((c) => c.status === "OPEN");
  const recovered = cases.filter((c) => c.status === "RECOVERED");
  const escalated = cases.filter((c) => c.status === "ESCALATED");
  const terminal = cases.filter((c) => ["RECOVERED", "STOPPED", "EXPIRED"].includes(c.status));

  const revenueAtRisk = open.reduce((s, c) => s + c.amount, 0);
  const revenueRecovered = recovered.reduce((s, c) => s + (c.revenue_recovered || 0), 0);
  const recoveryRate = terminal.length ? recovered.length / terminal.length : null;
  const totalAtRiskEver = cases.reduce((s, c) => s + c.amount, 0);
  const efficiency = totalAtRiskEver ? revenueRecovered / totalAtRiskEver : null;

  const attention = [...escalated, ...open.filter((c) => c.amount >= 50000)]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  return (
    <AppShell title="Command Center" subtitle="Live operational view of every recovery case TRACE is handling">
      {cases.length === 0 ? (
        <EmptyState
          label="No live cases yet"
          detail="Ingest a payment-failure event via POST /cases/ingest, or head to Performance to run a batch evaluation."
        />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-8 border-b border-mist-dark pb-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <KpiBlock label="Revenue At Risk" value={formatINR(revenueAtRisk, { compact: true })} sub={`${open.length} active cases`} tone="orange" size="hero" />
            </div>
            <KpiBlock label="Revenue Recovered" value={formatINR(revenueRecovered, { compact: true })} sub="simulated + real, labeled per case" tone="mint" />
            <KpiBlock label="Recovery Rate" value={recoveryRate !== null ? formatPct(recoveryRate) : "—"} sub={`${recovered.length} of ${terminal.length} resolved`} />
            <KpiBlock label="Cases Requiring Review" value={escalated.length} sub="flagged by policy" tone="amber" />
          </div>

          <LiveRecoveryFlow cases={cases} />

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-obsidian">Cases Needing Attention</h2>
              <Link to="/cases" className="text-xs text-signal-orange hover:underline">
                View all cases →
              </Link>
            </div>

            {attention.length === 0 ? (
              <EmptyState label="Nothing needs attention right now" detail="No escalated cases and no high-value cases currently open." />
            ) : (
              <div className="panel divide-y divide-mist-dark/70">
                {attention.map((c) => (
                  <Link
                    key={c.payment_id}
                    to={`/cases/${c.payment_id}`}
                    className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-mist/40"
                  >
                    <div className="flex items-center gap-4">
                      <StatusIndicator color={CASE_STATUS_COLOR[c.status]} pulse={c.status === "OPEN"} />
                      <span className="mono-num text-sm font-medium text-obsidian">{c.payment_id}</span>
                      <span className="text-xs text-obsidian/50">{FAILURE_LABEL[c.failure_type] || c.failure_type}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="mono-num text-sm text-obsidian">{formatINR(c.amount)}</span>
                      <span className="text-xs" style={{ color: CASE_STATUS_COLOR[c.status] }}>
                        {CASE_STATUS_LABEL[c.status]}
                      </span>
                      <span className="text-xs text-obsidian/35">{formatRelative(c.updated_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="border border-mist-dark/70 px-5 py-4">
              <div className="kicker">Recovery Efficiency</div>
              <div className="mono-num mt-1.5 text-xl font-semibold" style={{ color: SIGNAL.orange }}>
                {efficiency !== null ? formatPct(efficiency) : "—"}
              </div>
              <div className="mt-1 text-xs text-obsidian/45">of all revenue ever at risk, recovered</div>
            </div>
            <div className="border border-mist-dark/70 px-5 py-4">
              <div className="kicker">Active Recovery Cases</div>
              <div className="mono-num mt-1.5 text-xl font-semibold text-obsidian">{open.length}</div>
              <div className="mt-1 text-xs text-obsidian/45">currently in the OBSERVE → ACT loop</div>
            </div>
            <div className="border border-mist-dark/70 px-5 py-4">
              <div className="kicker">Total Cases Tracked</div>
              <div className="mono-num mt-1.5 text-xl font-semibold text-obsidian">{cases.length}</div>
              <div className="mt-1 text-xs text-obsidian/45">live-ingested, excludes batch evaluation</div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
