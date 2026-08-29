import { SIGNAL_CLASSES } from "@/lib/domain";

/**
 * Shows how the evaluated batch of cases distributes across its lifecycle:
 * AT RISK -> IN PROGRESS -> RECOVERED / STOPPED / ESCALATED / EXPIRED.
 * Bar widths are proportional to real counts from the current evaluation run --
 * nothing here is a stand-in for data we don't have.
 */
export function RecoveryFlow({ total, open, recovered, stopped, escalated, expired = 0 }) {
  const stages = [
    { key: "atRisk", label: "At risk", count: total, signal: "neutral" },
    { key: "open", label: "In progress", count: open, signal: "orange" },
    { key: "recovered", label: "Recovered", count: recovered, signal: "mint" },
    { key: "stopped", label: "Stopped", count: stopped, signal: "red" },
    { key: "escalated", label: "Escalated", count: escalated, signal: "amber" },
    ...(expired > 0 ? [{ key: "expired", label: "Expired", count: expired, signal: "red" }] : []),
  ];
  const max = Math.max(total, 1);

  return (
    <div className="flex items-end gap-4 h-full pt-4">
      {stages.map((s) => {
        const cls = SIGNAL_CLASSES[s.signal];
        const pct = Math.max((s.count / max) * 100, s.count > 0 ? 4 : 0);
        return (
          <div key={s.key} className="flex-1 flex flex-col items-center h-full justify-end gap-2">
            <span className="mono-tabular text-sm font-semibold text-bone">{s.count}</span>
            <div className="w-full flex-1 flex items-end bg-obsidian rounded-xs overflow-hidden">
              <div
                className={`w-full ${cls.bg} ${s.key === "open" ? "animate-pulse-slow" : ""}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wide text-ink-faint text-center">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
