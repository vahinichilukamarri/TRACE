import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { CASE_STATUS_COLOR, CASE_STATUS_LABEL, ACTION_LABEL, FAILURE_LABEL, SIGNAL } from "../../lib/constants";
import { formatINR } from "../../lib/format";
import StatusIndicator from "../common/StatusIndicator";

function priorityOf(c) {
  if (c.status !== "OPEN") return null;
  if (c.amount >= 50000) return { label: "High", color: SIGNAL.red };
  if (c.amount >= 10000) return { label: "Medium", color: SIGNAL.amber };
  return { label: "Low", color: SIGNAL.neutral };
}

export default function CaseRow({ item, latestDecision, loadingDetail }) {
  const priority = priorityOf(item);

  return (
    <Link
      to={`/cases/${item.payment_id}`}
      className="grid grid-cols-12 items-center gap-3 border-b border-mist-dark/70 px-5 py-3.5 text-sm transition-colors hover:bg-mist/40"
    >
      <div className="col-span-1">
        {priority ? (
          <span className="text-xs font-medium" style={{ color: priority.color }}>
            {priority.label}
          </span>
        ) : (
          <span className="text-xs text-obsidian/25">—</span>
        )}
      </div>

      <div className="col-span-2 mono-num font-medium text-obsidian">{item.payment_id}</div>

      <div className="col-span-1 mono-num text-obsidian">{formatINR(item.amount, { compact: true })}</div>

      <div className="col-span-2 text-obsidian/70">{FAILURE_LABEL[item.failure_type] || item.failure_type || "—"}</div>

      <div className="col-span-1 text-center text-obsidian/70">{item.previous_recovery_attempts}</div>

      <div className="col-span-2">
        {loadingDetail ? (
          <span className="text-xs text-obsidian/30">loading…</span>
        ) : latestDecision ? (
          <span className="text-xs font-medium" style={{ color: SIGNAL.orange }}>
            {ACTION_LABEL[latestDecision.action] || latestDecision.action}
          </span>
        ) : (
          <span className="text-xs text-obsidian/30">—</span>
        )}
      </div>

      <div className="col-span-2">
        <StatusIndicator
          color={CASE_STATUS_COLOR[item.status]}
          label={CASE_STATUS_LABEL[item.status]}
          pulse={item.status === "OPEN"}
        />
      </div>

      <div className="col-span-1 flex justify-end">
        <ChevronRight size={14} className="text-obsidian/25" />
      </div>
    </Link>
  );
}
