import { RECOVERY_LIFECYCLE_STAGES, SIGNAL_CLASSES } from "@/lib/domain";

/**
 * Recovery Trace Line -- TRACE's signature visual identity.
 *
 * Represents the actual recovery lifecycle:
 * FAILURE -> CONTEXT -> TRACE DECISION -> POLICY -> ACTION -> OUTCOME -> REASSESS -> RECOVERED/ADAPT/STOP
 *
 * This is not decoration: `activeIndex` reflects the case's true current stage.
 * `finalSignal` colors the terminal node once the case has resolved.
 *
 * compact=true renders a small horizontal version for case cards / list rows.
 */
export function RecoveryTraceLine({
  activeIndex = 0,
  finalSignal = null, // "mint" | "red" | "amber" | null (still in progress)
  compact = false,
  reassessed = false,
}) {
  const stages = RECOVERY_LIFECYCLE_STAGES;
  const lastIndex = stages.length - 1;

  const stageState = (i) => {
    if (i < activeIndex) return "done";
    if (i === activeIndex) return finalSignal && i === lastIndex ? "final" : "active";
    return "pending";
  };

  const nodeClasses = (i) => {
    const state = stageState(i);
    if (state === "final") {
      const cls = SIGNAL_CLASSES[finalSignal] || SIGNAL_CLASSES.neutral;
      return `${cls.bg} border-transparent`;
    }
    if (state === "done") return "bg-signal-orange border-transparent";
    if (state === "active") return "bg-obsidian-soft border-signal-orange animate-pulse-slow";
    return "bg-obsidian-soft border-obsidian-line";
  };

  const lineClasses = (i) => {
    // line segment AFTER node i, connecting to i+1
    const doneUpTo = finalSignal ? lastIndex : activeIndex;
    if (i < doneUpTo) return "bg-signal-orange";
    return "bg-obsidian-line";
  };

  if (compact) {
    return (
      <div className="flex items-center gap-0.5 w-full" aria-label="Recovery trace">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-1.5 h-1.5 rounded-full border shrink-0 ${nodeClasses(i)}`}
              title={s.label}
            />
            {i < lastIndex && <div className={`h-px flex-1 ${lineClasses(i)}`} />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center w-full">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="relative flex flex-col items-center gap-2 shrink-0">
              <div
                className={`w-3 h-3 rounded-full border-2 shrink-0 transition-colors ${nodeClasses(i)}`}
              />
              <span
                className={`text-[10px] font-mono uppercase tracking-wide whitespace-nowrap absolute top-5 ${
                  stageState(i) === "pending" ? "text-ink-faint" : "text-bone"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < lastIndex && (
              <div className={`h-px flex-1 mx-1 transition-colors ${lineClasses(i)}`} />
            )}
          </div>
        ))}
      </div>
      {reassessed && (
        <div className="mt-8 text-[10px] font-mono uppercase tracking-wide text-signal-amber">
          ↺ Strategy changed after reassessment
        </div>
      )}
    </div>
  );
}
