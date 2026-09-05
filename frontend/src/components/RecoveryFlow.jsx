import { SIGNAL_CLASSES } from "@/lib/domain";

/**
 * Shows how the evaluated batch of cases distributes across its lifecycle:
 * AT RISK -> IN PROGRESS -> RECOVERED / STOPPED / ESCALATED / EXPIRED.
 * Bar widths are proportional to real counts from the current evaluation run --
 * nothing here is a stand-in for data we don't have.
 *
 * Rendered inside a cream record, so it reads the base signal group.
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
    <div className="flex h-full items-end gap-2 pt-4 sm:gap-4">
      {stages.map((s) => {
        const cls = SIGNAL_CLASSES[s.signal];
        const pct = Math.max((s.count / max) * 100, s.count > 0 ? 4 : 0);
        return (
          <div key={s.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="tnum text-sm font-semibold text-graphite">{s.count}</span>
            {/* The track is a faint tint of the ink, not a cream fill: a
                second cream on a cream record reads as a filled column and
                buries the bar it is supposed to frame. Kept very light, so an
                empty track is never mistaken for a bar of its own. */}
            <div className="flex w-full flex-1 items-end overflow-hidden rounded-xs bg-graphite/6 ring-1 ring-inset ring-rule">
              <div
                className={`w-full rounded-t-xs ${cls.bg} ${s.key === "open" ? "animate-pulse-slow" : ""}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="eyebrow w-full truncate text-center text-graphite/70">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
