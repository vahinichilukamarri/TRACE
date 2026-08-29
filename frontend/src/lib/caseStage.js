import { CaseStatus } from "./domain";

const TERMINAL_SIGNAL = {
  RECOVERED: "mint",
  STOPPED: "red",
  ESCALATED: "amber",
  EXPIRED: "red",
};

/**
 * Derives { activeIndex, finalSignal, reassessed } for RecoveryTraceLine
 * from a case's real state -- this keeps the trace line an accurate
 * reflection of system behavior, not a decorative stepper.
 */
export function deriveTraceStage(caseData) {
  if (!caseData) return { activeIndex: 0, finalSignal: null, reassessed: false };

  const decisions = caseData.decisions || [];
  const policyChecks = caseData.policy_checks || [];
  const executions = caseData.executions || [];
  const outcomes = caseData.outcomes || [];
  const isTerminal = caseData.status && caseData.status !== CaseStatus.OPEN;

  let activeIndex = 0;
  if (caseData.failure_type) activeIndex = 1; // context understood
  if (decisions.length > 0) activeIndex = 2;
  if (policyChecks.length > 0) activeIndex = 3;
  if (executions.length > 0) activeIndex = 4;
  if (outcomes.length > 0) activeIndex = 5;
  if (decisions.length > 1) activeIndex = 6; // has reassessed at least once
  if (isTerminal) activeIndex = 7;

  return {
    activeIndex,
    finalSignal: isTerminal ? TERMINAL_SIGNAL[caseData.status] || "neutral" : null,
    reassessed: decisions.length > 1,
  };
}

/**
 * Coarse variant for list views that only have `CaseOut` (no decisions/policy/
 * execution/outcome arrays -- those only come back on the case detail endpoint).
 * Ingest always runs a first iteration synchronously, so any classified OPEN
 * case has already had at least one decision -> policy -> action -> outcome
 * pass; we can't show the exact iteration without fetching the full case, so
 * this deliberately stops at "action" rather than guessing further.
 */
export function deriveTraceStageSummary(caseOut) {
  if (!caseOut) return { activeIndex: 0, finalSignal: null };
  const isTerminal = caseOut.status && caseOut.status !== CaseStatus.OPEN;
  if (isTerminal) {
    return { activeIndex: 7, finalSignal: TERMINAL_SIGNAL[caseOut.status] || "neutral" };
  }
  if (caseOut.previous_recovery_action) return { activeIndex: 4, finalSignal: null };
  if (caseOut.failure_type) return { activeIndex: 2, finalSignal: null };
  return { activeIndex: 1, finalSignal: null };
}
