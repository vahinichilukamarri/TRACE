import { formatTime } from "@/lib/format";
import { SIGNAL_CLASSES } from "@/lib/domain";

const EVENT_SIGNAL = {
  CASE_CREATED: "orange",
  DUPLICATE_EVENT: "neutral",
  CLASSIFIED: "orange",
  AGENT_DECISION: "orange",
  AGENT_FALLBACK: "amber",
  POLICY_CHECK: "mint",
  EXECUTION: "orange",
  OUTCOME: "mint",
  REASSESSMENT: "amber",
  STATUS_CHANGE: "neutral",
  CUSTOMER_ENGAGEMENT: "mint",
};

const EVENT_LABELS = {
  CASE_CREATED: "Case created",
  DUPLICATE_EVENT: "Duplicate event ignored",
  CLASSIFIED: "Failure classified",
  AGENT_DECISION: "TRACE decision",
  AGENT_FALLBACK: "Agent fallback used",
  POLICY_CHECK: "Policy check",
  EXECUTION: "Action executed",
  OUTCOME: "Outcome recorded",
  REASSESSMENT: "Reassessed",
  STATUS_CHANGE: "Status changed",
  CUSTOMER_ENGAGEMENT: "Customer engagement",
};

function summarizePayload(eventType, payload) {
  if (!payload || typeof payload !== "object") return null;
  const keys = Object.keys(payload);
  if (keys.length === 0) return null;
  // Show a couple of the most relevant fields inline, compact key: value form
  const priorityKeys = ["action", "result", "outcome", "status", "failure_code", "decision", "reason"];
  const shown = priorityKeys.filter((k) => k in payload).slice(0, 2);
  const fallback = shown.length ? shown : keys.slice(0, 2);
  return fallback.map((k) => `${k}=${String(payload[k])}`).join("  ");
}

/*
 * The audit trail, set as a ledger rather than a feed: a numbered line, a
 * tabular timestamp, the event, and what it carried. It is the immutable
 * counterpart to the reasoned record above it, so it reads like a register --
 * fixed columns, hairline rows, a double rule under the head.
 *
 * It carries its own cream surface rather than inheriting whatever ground the
 * caller happens to provide.
 */
export function Timeline({ entries = [] }) {
  if (!entries.length) return null;
  return (
    <div className="record overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-2 pt-4 sm:px-6">
        <span className="eyebrow text-graphite/60">/ immutable event log</span>
        <span className="tnum text-[11px] text-graphite/70">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <ol className="rule-double mx-4 sm:mx-6">
        {entries.map((entry, i) => {
          const signal = EVENT_SIGNAL[entry.event_type] || "neutral";
          const cls = SIGNAL_CLASSES[signal];
          const summary = summarizePayload(entry.event_type, entry.payload);
          return (
            <li
              key={i}
              className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-rule py-2.5 last:border-b-0 sm:grid-cols-[2.25rem_5rem_11rem_minmax(0,1fr)]"
            >
              <span className="tnum text-[11px] text-graphite/60">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="tnum text-xs text-graphite/70">{formatTime(entry.timestamp)}</span>
              <span className="col-start-2 flex min-w-0 items-baseline gap-2 sm:col-start-3">
                <span
                  aria-hidden="true"
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${cls.dot}`}
                />
                <span className="wrap-prose text-xs font-semibold text-graphite">
                  {EVENT_LABELS[entry.event_type] || entry.event_type}
                </span>
              </span>
              <span className="col-start-2 min-w-0 sm:col-start-4">
                {summary && (
                  <span className="tnum wrap-prose block text-[11px] leading-relaxed text-graphite/70">
                    {summary}
                  </span>
                )}
                {entry.notes && (
                  <span className="wrap-prose mt-0.5 block text-xs leading-relaxed text-graphite/80">
                    {entry.notes}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="h-4" />
    </div>
  );
}
