import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { SIGNAL } from "../../lib/constants";

/**
 * higherIsBetter=true  → TRACE above baseline reads as good (mint), below as bad (red)
 * higherIsBetter=false → inverted (used for "unnecessary interventions" etc.)
 */
export default function ComparisonMetric({ label, traceValue, baselineValue, format, higherIsBetter = true, emphasize = false }) {
  const traceNum = typeof traceValue === "number" ? traceValue : parseFloat(traceValue);
  const baseNum = typeof baselineValue === "number" ? baselineValue : parseFloat(baselineValue);
  const delta = !Number.isNaN(traceNum) && !Number.isNaN(baseNum) ? traceNum - baseNum : null;
  const isBetter = delta !== null && (higherIsBetter ? delta > 0 : delta < 0);
  const isWorse = delta !== null && (higherIsBetter ? delta < 0 : delta > 0);

  const deltaColor = isBetter ? SIGNAL.mint : isWorse ? SIGNAL.red : SIGNAL.neutral;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;

  return (
    <div className={`border-b border-mist-dark/70 py-4 ${emphasize ? "bg-signal-orange/[0.04] px-4 -mx-4" : ""}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm ${emphasize ? "font-semibold text-obsidian" : "text-obsidian/70"}`}>{label}</span>
        {delta !== null && (
          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: deltaColor }}>
            <DeltaIcon size={11} strokeWidth={2.5} />
            {format ? format(Math.abs(delta)) : Math.abs(delta).toFixed(2)}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <div>
          <div className="label-micro !text-signal-orange/70">TRACE</div>
          <div className={`mono-num mt-0.5 font-semibold text-obsidian ${emphasize ? "text-xl" : "text-base"}`}>
            {format ? format(traceValue) : traceValue}
          </div>
        </div>
        <div>
          <div className="label-micro">Baseline</div>
          <div className={`mono-num mt-0.5 font-medium text-obsidian/60 ${emphasize ? "text-xl" : "text-base"}`}>
            {format ? format(baselineValue) : baselineValue}
          </div>
        </div>
      </div>
    </div>
  );
}
