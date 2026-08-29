import { Link } from "react-router-dom";
import {
  ACTION_LABELS,
  CASE_STATUS_LABELS,
  FAILURE_LABELS,
  STATUS_SIGNAL,
} from "@/lib/domain";
import { formatCurrency, formatRelative } from "@/lib/format";
import { StatusPill } from "./StatusIndicator";
import { RecoveryTraceLine } from "./RecoveryTraceLine";
import { deriveTraceStageSummary } from "@/lib/caseStage";

export function CaseCard({ caseData }) {
  const { activeIndex, finalSignal } = deriveTraceStageSummary(caseData);

  return (
    <Link
      to={`/cases/${encodeURIComponent(caseData.payment_id)}`}
      className="block border border-obsidian-line bg-obsidian-soft hover:border-signal-orange/50 transition-colors p-4 group"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-ink-faint">{caseData.payment_id}</span>
            <StatusPill signal={STATUS_SIGNAL[caseData.status] || "neutral"}>
              {CASE_STATUS_LABELS[caseData.status] || caseData.status}
            </StatusPill>
          </div>
          <div className="mono-tabular text-xl font-semibold text-bone">
            {formatCurrency(caseData.amount, caseData.currency)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-ink-faint">{FAILURE_LABELS[caseData.failure_type] || caseData.failure_type || "Unclassified"}</div>
          <div className="text-[11px] font-mono text-ink-faint mt-0.5">
            {formatRelative(caseData.updated_at)}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <RecoveryTraceLine activeIndex={activeIndex} finalSignal={finalSignal} compact />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4 text-ink-faint font-mono">
          <span>attempts: {caseData.previous_recovery_attempts}</span>
          <span>success rate: {Math.round(caseData.customer_success_rate * 100)}%</span>
        </div>
        {caseData.previous_recovery_action && (
          <span className="text-signal-orange font-medium group-hover:underline">
            {ACTION_LABELS[caseData.previous_recovery_action] || caseData.previous_recovery_action}
          </span>
        )}
      </div>
    </Link>
  );
}
