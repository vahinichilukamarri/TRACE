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
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 border-b border-rule py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${
        highlight ? "-mx-4 bg-paper-alt px-4" : ""
      }`}
    >
      <div className={`min-w-0 text-sm ${highlight ? "font-medium text-graphite" : "text-graphite/80"}`}>
        {label}
      </div>
      <div className="min-w-[5rem] text-right">
        <div className="eyebrow mb-1 text-graphite/60">baseline</div>
        <div className="tnum wrap-id text-sm text-graphite/70">
          {baselineValue}
          {unit}
        </div>
      </div>
      <div className="min-w-[6.5rem] text-right">
        <div className="eyebrow mb-1 text-electric">trace</div>
        <div
          className={`tnum wrap-id font-semibold ${highlight ? "text-lg" : "text-sm"} ${
            improved === true
              ? "text-signal-mint"
              : improved === false
                ? "text-signal-red"
                : "text-graphite"
          }`}
        >
          {traceValue}
          {unit}
        </div>
      </div>
    </div>
  );
}
