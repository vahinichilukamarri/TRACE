import { SIGNAL_CLASSES } from "@/lib/domain";

/**
 * KpiBlock renders one operational metric. `hero` makes it the dominant
 * figure on the page (Command Center's Revenue at Risk).
 */
export function KpiBlock({ label, value, sublabel, signal, hero = false, delta, trend }) {
  const cls = signal ? SIGNAL_CLASSES[signal] : null;
  return (
    <div className={hero ? "flex flex-col gap-2" : "flex flex-col gap-1.5"}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium tracking-[0.12em] uppercase text-ink-faint">
          {label}
        </span>
        {trend && (
          <span
            className={`text-[10px] font-mono ${
              trend === "up" ? "text-signal-mint" : trend === "down" ? "text-signal-red" : "text-ink-faint"
            }`}
          >
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}
          </span>
        )}
      </div>
      <div
        className={`mono-tabular font-semibold ${cls ? cls.text : "text-bone"} ${
          hero ? "text-5xl md:text-6xl leading-none" : "text-2xl leading-none"
        }`}
      >
        {value}
      </div>
      {(sublabel || delta) && (
        <div className="text-xs text-ink-faint font-mono">
          {sublabel}
          {delta && <span className="ml-2 text-signal-orange">{delta}</span>}
        </div>
      )}
    </div>
  );
}
