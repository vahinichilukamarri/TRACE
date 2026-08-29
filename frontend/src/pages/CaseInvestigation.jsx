import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, MousePointerClick } from "lucide-react";
import AppShell from "../components/shell/AppShell";
import { LoadingState, ErrorState } from "../components/common/States";
import RecoveryTraceLine from "../components/trace/RecoveryTraceLine";
import ReasoningPanel from "../components/trace/ReasoningPanel";
import PolicyCheckPanel from "../components/trace/PolicyCheckPanel";
import ActionOutcomePanel from "../components/trace/ActionOutcomePanel";
import Timeline from "../components/trace/Timeline";
import StatusIndicator from "../components/common/StatusIndicator";
import { api } from "../lib/api";
import { formatINR, formatPct, formatTime } from "../lib/format";
import { CASE_STATUS_COLOR, CASE_STATUS_LABEL, FAILURE_LABEL } from "../lib/constants";

export default function CaseInvestigation() {
  const { paymentId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getCase(paymentId);
      setDetail(d);
    } catch (e) {
      setError(e);
    }
  }, [paymentId]);

  useEffect(() => {
    load();
  }, [load]);

  const isTerminal = detail && ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"].includes(detail.status);

  async function handleReassess() {
    setBusy(true);
    try {
      await api.reassess(paymentId);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleClick() {
    setBusy(true);
    try {
      await api.click(paymentId);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Case Investigation" subtitle={paymentId}>
      <Link to="/cases" className="mb-5 inline-flex items-center gap-1.5 text-xs text-obsidian/50 hover:text-obsidian">
        <ArrowLeft size={12} /> Back to Recovery Cases
      </Link>

      {error && <ErrorState message="Could not load this case" detail={error.message} onRetry={load} />}
      {!error && !detail && <LoadingState label="Loading case file" />}

      {detail && (
        <div className="space-y-8">
          {/* Transaction summary */}
          <div className="panel">
            <div className="flex items-center justify-between border-b border-mist-dark/70 px-6 py-4">
              <div className="flex items-center gap-4">
                <span className="mono-num text-base font-semibold text-obsidian">{detail.payment_id}</span>
                <StatusIndicator color={CASE_STATUS_COLOR[detail.status]} label={CASE_STATUS_LABEL[detail.status]} pulse={detail.status === "OPEN"} />
              </div>
              <div className="flex gap-2">
                {!isTerminal && (
                  <button onClick={handleReassess} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">
                    <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Reassess
                  </button>
                )}
                {!isTerminal && detail.customer_engagement === "LINK_SENT" && (
                  <button onClick={handleClick} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
                    <MousePointerClick size={12} /> Simulate Customer Click
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 px-6 py-5 md:grid-cols-6">
              <SummaryField label="Amount" value={formatINR(detail.amount)} />
              <SummaryField label="Failure" value={FAILURE_LABEL[detail.failure_type] || detail.failure_type || "—"} />
              <SummaryField label="Classification" value={detail.classification_method || "—"} />
              <SummaryField label="Class. Confidence" value={detail.classification_confidence != null ? formatPct(detail.classification_confidence) : "—"} />
              <SummaryField label="Customer Success Rate" value={formatPct(detail.customer_success_rate)} />
              <SummaryField label="Prior Attempts" value={detail.previous_recovery_attempts} />
              <SummaryField label="Opportunities Left" value={detail.remaining_recovery_opportunities} />
              <SummaryField label="Time Since Failure" value={`${detail.time_since_failure_minutes}m`} />
              <SummaryField label="Engagement" value={detail.customer_engagement} />
              <SummaryField label="Source" value={detail.source} />
              <SummaryField label="Created" value={formatTime(detail.created_at)} />
              <SummaryField label="Updated" value={formatTime(detail.updated_at)} />
            </div>

            <div className="border-t border-mist-dark/70 px-6 py-5">
              <div className="kicker mb-3">Recovery Trace Line</div>
              <RecoveryTraceLine caseDetail={detail} variant="full" />
            </div>
          </div>

          {/* Reasoning */}
          {detail.decisions?.length > 0 && (
            <ReasoningPanel decision={detail.decisions[detail.decisions.length - 1]} />
          )}

          {/* Policy */}
          <PolicyCheckPanel checks={detail.policy_checks} />

          {/* Action + Outcome */}
          <ActionOutcomePanel executions={detail.executions} outcomes={detail.outcomes} />

          {/* Reassessment history, if any */}
          {detail.decisions?.length > 1 && (
            <div className="panel">
              <div className="border-b border-mist-dark/70 px-5 py-3.5">
                <span className="text-sm font-medium text-obsidian">Reassessment History</span>
              </div>
              <div className="divide-y divide-mist-dark/70">
                {detail.decisions.map((d, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <span className="kicker">Iteration {d.iteration}</span>
                    <span className="text-sm text-obsidian">{d.action}</span>
                    <span className="mono-num text-xs text-obsidian/40">{formatPct(d.confidence)} confidence</span>
                    <span className="mono-num text-xs text-obsidian/35">{formatTime(d.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full audit timeline */}
          <div>
            <h2 className="mb-3 text-sm font-medium text-obsidian">Recovery Timeline</h2>
            <div className="panel px-6 py-6">
              <Timeline events={detail.audit_log} />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function SummaryField({ label, value }) {
  return (
    <div>
      <div className="label-micro">{label}</div>
      <div className="mono-num mt-1 text-sm font-medium text-obsidian">{value ?? "—"}</div>
    </div>
  );
}
