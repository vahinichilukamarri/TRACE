import { SIGNAL_CLASSES } from "@/lib/domain";

/**
 * KpiBlock renders one operational metric. `hero` makes it the dominant
 * figure on the page (Command Center's Revenue at Risk).
 *
 * A figure is a record, so this is drawn as ink on cream and reads the BASE
 * signal group: every caller now places it inside a `.record` or `.record-hi`
 * surface resting on the desk, rather than setting bare figures on the dark
 * ground where the numbers had nothing holding them.
 *
 * A hero figure closes on a double rule, the ledger's mark for a settled
 * total, with its qualifier below the line.
 */
export function KpiBlock({ label, value, sublabel, signal, hero = false, delta, trend }) {
  const cls = signal ? SIGNAL_CLASSES[signal] : null;
  const caption = (sublabel || delta) && (
    <div className="text-xs leading-relaxed text-graphite/70">
      {sublabel}
      {delta && <span className="tnum ml-2 font-medium text-electric">{delta}</span>}
    </div>
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="eyebrow text-graphite/60">/ {label}</span>
        {trend && (
          <span
            className={`text-[10px] ${
              trend === "up"
                ? "text-approve-deep"
                : trend === "down"
                  ? "text-signal-red"
                  : "text-graphite/60"
            }`}
          >
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "—"}
          </span>
        )}
      </div>

      {/* Figures wrap rather than overflow: a compact currency string still
          runs long at hero size on a narrow column. */}
      <div
        className={`tnum wrap-id mt-2 font-semibold leading-none ${
          cls ? cls.text : "text-graphite"
        } ${hero ? "text-4xl sm:text-5xl" : "text-2xl"}`}
      >
        {value}
      </div>

      {hero ? (
        caption && <div className="rule-double mt-4 pt-2.5">{caption}</div>
      ) : (
        caption && <div className="mt-2">{caption}</div>
      )}
    </div>
  );
}
