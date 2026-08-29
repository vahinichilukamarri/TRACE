import { TRACE_STAGES, stageStatesForCase, SIGNAL } from "../../lib/constants";

const NODE_COLOR = {
  done: "#1A1A1A",
  active: SIGNAL.orange,
  pending: "#D8D4C8",
};

/**
 * The Recovery Trace Line: FAILURE → CONTEXT → DECISION → POLICY → ACTION →
 * OUTCOME → REASSESS → RESOLVED. Not decoration — every node's state is
 * read directly off the case's decisions/policy_checks/executions/outcomes.
 *
 * variant="compact"  — small inline strip for case queue rows / dashboard
 * variant="full"     — labeled, spaced-out version for the investigation page
 */
export default function RecoveryTraceLine({ caseDetail, variant = "full" }) {
  const { states, finalColor } = stageStatesForCase(caseDetail);
  const compact = variant === "compact";

  return (
    <div className="flex items-center">
      {TRACE_STAGES.map((stage, i) => {
        const isLast = i === TRACE_STAGES.length - 1;
        const state = states[stage.key];
        const color = isLast && state === "done" ? finalColor : NODE_COLOR[state];
        const isActive = state === "active";

        return (
          <div key={stage.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <span className="relative flex items-center justify-center" style={{ width: compact ? 8 : 10, height: compact ? 8 : 10 }}>
                {isActive && (
                  <span
                    className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span
                  className="inline-flex rounded-full"
                  style={{
                    width: compact ? 6 : 8,
                    height: compact ? 6 : 8,
                    backgroundColor: state === "pending" ? "transparent" : color,
                    border: state === "pending" ? `1.5px solid ${color}` : "none",
                  }}
                />
              </span>
              {!compact && (
                <span
                  className="label-micro mt-1.5 whitespace-nowrap"
                  style={{ color: state === "pending" ? undefined : "rgba(17,17,17,0.65)" }}
                >
                  {stage.label}
                </span>
              )}
            </div>
            {!isLast && (
              <div
                className={compact ? "w-4" : "w-8"}
                style={{
                  height: 1.5,
                  backgroundColor: states[TRACE_STAGES[i + 1].key] === "pending" && state === "pending" ? "#E8E5DD" : "#D8D4C8",
                  marginBottom: compact ? 0 : 18,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
