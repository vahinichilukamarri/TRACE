export function ComparisonMetric({ label, baselineValue, traceValue, unit = "", highlight = false, better = "higher" }) {
  const baseNum = Number(baselineValue);
  const traceNum = Number(traceValue);
  const improved =
    !isNaN(baseNum) && !isNaN(traceNum)
      ? better === "higher"
        ? traceNum > baseNum
        : traceNum < baseNum
      : null;

  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto] items-center gap-6 py-4 border-b border-obsidian-line last:border-b-0 ${
        highlight ? "bg-signal-orange-dim/5 -mx-4 px-4" : ""
      }`}
    >
      <div className={`text-sm ${highlight ? "text-bone font-medium" : "text-ink-soft"}`}>{label}</div>
      <div className="text-right">
        <div className="text-[10px] font-mono uppercase tracking-wide text-ink-faint mb-0.5">
          Baseline
        </div>
        <div className="mono-tabular text-sm text-ink-faint">
          {baselineValue}
          {unit}
        </div>
      </div>
      <div className="text-right min-w-[110px]">
        <div className="text-[10px] font-mono uppercase tracking-wide text-signal-orange mb-0.5">
          TRACE
        </div>
        <div
          className={`mono-tabular font-semibold ${
            highlight ? "text-lg" : "text-sm"
          } ${improved === true ? "text-signal-mint" : improved === false ? "text-signal-red" : "text-bone"}`}
        >
          {traceValue}
          {unit}
        </div>
      </div>
    </div>
  );
}
