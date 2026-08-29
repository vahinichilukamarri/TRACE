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

export function Timeline({ entries = [] }) {
  if (!entries.length) return null;
  return (
    <ol className="relative border-l border-obsidian-line ml-1.5">
      {entries.map((entry, i) => {
        const signal = EVENT_SIGNAL[entry.event_type] || "neutral";
        const cls = SIGNAL_CLASSES[signal];
        const summary = summarizePayload(entry.event_type, entry.payload);
        return (
          <li key={i} className="pl-5 pb-5 last:pb-0 relative">
            <span
              className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${cls.dot} ring-4 ring-obsidian`}
            />
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-mono text-ink-faint">{formatTime(entry.timestamp)}</span>
              <span className="text-xs font-medium text-bone">
                {EVENT_LABELS[entry.event_type] || entry.event_type}
              </span>
            </div>
            {summary && (
              <div className="text-[11px] font-mono text-ink-faint mt-0.5 truncate">{summary}</div>
            )}
            {entry.notes && <div className="text-xs text-ink-soft mt-0.5">{entry.notes}</div>}
          </li>
        );
      })}
    </ol>
  );
}
