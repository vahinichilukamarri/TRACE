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
 *
 * Node styling is ground-agnostic on purpose: the compact variant sits on a
 * cream case card and the full variant on the dark case-investigation panel,
 * so fills are either the accent, a verdict colour, or transparent with a
 * hairline -- all of which read on both. Only the stage labels are dark-only,
 * because the compact variant does not render them at all.
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
    if (state === "done") return "bg-electric border-transparent";
    if (state === "active") return "bg-transparent border-electric animate-pulse-slow";
    return "bg-transparent border-rule/60";
  };

  const lineClasses = (i) => {
    // line segment AFTER node i, connecting to i+1
    const doneUpTo = finalSignal ? lastIndex : activeIndex;
    if (i < doneUpTo) return "bg-electric";
    return "bg-rule/40";
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

  const currentLabel = stages[Math.min(activeIndex, lastIndex)].label;

  return (
    <div className="w-full">
      {/* Stage labels are absolutely positioned under their node and can run to
          three lines, so the row reserves the space rather than letting them
          collide with whatever follows.

          Eight 80px labels need ~640px of track. Below lg there is never that
          much room -- with the rail open a tablet leaves under 470px -- so the
          per-stage labels give way to a single caption naming where the case
          has got to, rather than overprinting each other into noise. */}
      <div className="flex w-full items-center pb-3 lg:pb-12">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="relative flex flex-col items-center gap-2 shrink-0">
              <div
                className={`w-3 h-3 rounded-full border-2 shrink-0 transition-colors ${nodeClasses(i)}`}
              />
              <span
                className={`eyebrow absolute top-5 hidden w-20 leading-tight lg:block ${
                  i === 0
                    ? "left-0 text-left"
                    : i === lastIndex
                      ? "right-0 text-right"
                      : "left-1/2 -translate-x-1/2 text-center"
                } ${
                  stageState(i) === "pending" ? "text-cream-dim" : "text-cream"
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
      <div className="eyebrow mb-2 text-cream-dim lg:hidden">
        stage {Math.min(activeIndex, lastIndex) + 1} of {stages.length} · {currentLabel}
      </div>

      {reassessed && (
        <div className="eyebrow text-hold-bright">
          ↺ Strategy changed after reassessment
        </div>
      )}
    </div>
  );
}
