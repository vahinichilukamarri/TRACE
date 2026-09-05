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

/* One case, as a cream document resting on the desk. */
export function CaseCard({ caseData }) {
  const { activeIndex, finalSignal } = deriveTraceStageSummary(caseData);

  return (
    <Link
      to={`/cases/${encodeURIComponent(caseData.payment_id)}`}
      className="record group block p-4 transition-colors hover:border-electric/50"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Payment IDs have no spaces to break on, so they get character
                wrapping rather than a width they can push past. */}
            <span className="tnum wrap-id min-w-0 text-xs text-graphite/70">
              {caseData.payment_id}
            </span>
            <StatusPill signal={STATUS_SIGNAL[caseData.status] || "neutral"}>
              {CASE_STATUS_LABELS[caseData.status] || caseData.status}
            </StatusPill>
          </div>
          <div className="tnum wrap-id text-xl font-semibold text-graphite">
            {formatCurrency(caseData.amount, caseData.currency)}
          </div>
        </div>
        <div className="min-w-0 shrink-0 text-right">
          <div className="text-xs leading-snug text-graphite/70">
            {FAILURE_LABELS[caseData.failure_type] || caseData.failure_type || "Unclassified"}
          </div>
          <div className="tnum mt-0.5 text-[11px] text-graphite/70">
            {formatRelative(caseData.updated_at)}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <RecoveryTraceLine activeIndex={activeIndex} finalSignal={finalSignal} compact />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-xs">
        <div className="tnum flex flex-wrap items-center gap-x-4 gap-y-1 text-graphite/70">
          <span>attempts: {caseData.previous_recovery_attempts}</span>
          <span>success rate: {Math.round(caseData.customer_success_rate * 100)}%</span>
        </div>
        {caseData.previous_recovery_action && (
          <span className="min-w-0 truncate font-medium text-electric group-hover:underline">
            {ACTION_LABELS[caseData.previous_recovery_action] ||
              caseData.previous_recovery_action}
          </span>
        )}
      </div>
    </Link>
  );
}
