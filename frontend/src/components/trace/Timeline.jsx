import { formatTime } from "../../lib/format";
import { SIGNAL, POLICY_RESULT_COLOR, OUTCOME_COLOR } from "../../lib/constants";

function eventColor(entry) {
  switch (entry.event_type) {
    case "AGENT_DECISION":
      return SIGNAL.orange;
    case "AGENT_FALLBACK":
      return SIGNAL.amber;
    case "POLICY_CHECK":
      return POLICY_RESULT_COLOR[entry.payload?.result] || SIGNAL.neutral;
    case "EXECUTION":
      return entry.payload?.execution_type === "REAL" ? SIGNAL.orange : SIGNAL.neutral;
    case "OUTCOME":
      return OUTCOME_COLOR[entry.payload?.outcome] || SIGNAL.neutral;
    case "STATUS_CHANGE":
      return OUTCOME_COLOR[entry.payload?.new_status] || SIGNAL.neutral;
    case "REASSESSMENT":
      return SIGNAL.amber;
    case "CUSTOMER_ENGAGEMENT":
      return SIGNAL.mint;
    case "DUPLICATE_EVENT":
      return SIGNAL.red;
    default:
      return SIGNAL.neutral;
  }
}

function eventTitle(entry) {
  const p = entry.payload || {};
  switch (entry.event_type) {
    case "CASE_CREATED":
      return "Case created from payment-failure event";
    case "CLASSIFIED":
      return `Classified as ${p.failure_type} (${p.method}, ${Math.round((p.confidence ?? 0) * 100)}% confidence)`;
    case "AGENT_DECISION":
      return `TRACE decided: ${p.action} — ${p.decision}`;
    case "AGENT_FALLBACK":
      return "Agent reasoning failed — safe fallback applied";
    case "POLICY_CHECK":
      return `Policy ${p.result} for ${p.proposed_action}`;
    case "EXECUTION":
      return `Executed ${p.action} (${p.execution_type}${p.delivery ? `, ${p.delivery}` : ""})`;
    case "OUTCOME":
      return `Outcome: ${p.outcome}${p.revenue_recovered ? ` — ₹${p.revenue_recovered}` : ""}`;
    case "STATUS_CHANGE":
      return `Status → ${p.new_status}`;
    case "REASSESSMENT":
      return `Reassessment #${p.iteration}`;
    case "CUSTOMER_ENGAGEMENT":
      return `Customer engagement: ${p.engagement}`;
    case "DUPLICATE_EVENT":
      return "Duplicate event ignored — existing case reused";
    default:
      return entry.event_type;
  }
}

export default function Timeline({ events = [] }) {
  if (!events.length) return null;
  return (
    <ol className="relative border-l border-mist-dark pl-5">
      {events.map((entry, i) => {
        const color = eventColor(entry);
        return (
          <li key={i} className="relative pb-6 last:pb-0">
            <span
              className="absolute -left-[25px] top-1 inline-flex h-2.5 w-2.5 rounded-full ring-4 ring-bone"
              style={{ backgroundColor: color }}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-obsidian">{eventTitle(entry)}</span>
              <span className="mono-num shrink-0 text-[11px] text-obsidian/40">{formatTime(entry.timestamp)}</span>
            </div>
            {entry.notes && <p className="mt-1 text-xs text-obsidian/50">{entry.notes}</p>}
          </li>
        );
      })}
    </ol>
  );
}
