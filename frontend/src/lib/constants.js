// Semantic signal colors — used ONLY to communicate system state, never decoratively.
export const SIGNAL = {
  orange: "#FF6B35", // TRACE activity / primary / in-progress
  mint: "#34D399", // recovered / approved / success
  amber: "#F4B942", // waiting / review / uncertainty
  red: "#EF4444", // failed / blocked / stopped
  neutral: "#8A867A", // inactive / not-yet-reached
};

export const CASE_STATUS_COLOR = {
  OPEN: SIGNAL.orange,
  RECOVERED: SIGNAL.mint,
  STOPPED: SIGNAL.red,
  ESCALATED: SIGNAL.amber,
  EXPIRED: SIGNAL.red,
};

export const CASE_STATUS_LABEL = {
  OPEN: "Active",
  RECOVERED: "Recovered",
  STOPPED: "Stopped",
  ESCALATED: "Escalated",
  EXPIRED: "Expired",
};

export const POLICY_RESULT_COLOR = {
  APPROVED: SIGNAL.mint,
  BLOCKED: SIGNAL.red,
  FLAGGED_FOR_REVIEW: SIGNAL.amber,
};

export const OUTCOME_COLOR = {
  RECOVERED: SIGNAL.mint,
  NOT_RECOVERED: SIGNAL.red,
  PENDING: SIGNAL.amber,
  NOT_APPLICABLE: SIGNAL.neutral,
};

export const EXECUTION_TYPE_COLOR = {
  REAL: SIGNAL.orange,
  SIMULATED: SIGNAL.neutral,
};

export const ACTION_LABEL = {
  RETRY_PAYMENT: "Retry Payment",
  SEND_RECOVERY_LINK: "Send Recovery Link",
  SUGGEST_ALTERNATIVE_METHOD: "Suggest Alternative Method",
  WAIT_AND_REASSESS: "Wait & Reassess",
  ESCALATE_FOR_REVIEW: "Escalate for Review",
  STOP_RECOVERY: "Stop Recovery",
};

export const FAILURE_LABEL = {
  BANK_TIMEOUT: "Bank Timeout",
  CARD_DECLINED: "Card Declined",
  INSUFFICIENT_FUNDS: "Insufficient Funds",
  AUTH_FAILURE: "Auth Failure",
  PROCESSING_ERROR: "Processing Error",
};

// The Recovery Trace Line — TRACE's signature lifecycle visual.
// Reused across the Command Center, case queue rows, and the case
// investigation page. Each stage maps to real data present (or not) on a
// CaseDetailOut record — this is a state readout, not decoration.
export const TRACE_STAGES = [
  { key: "failure", label: "Failure" },
  { key: "context", label: "Context" },
  { key: "decision", label: "Decision" },
  { key: "policy", label: "Policy" },
  { key: "action", label: "Action" },
  { key: "outcome", label: "Outcome" },
  { key: "reassess", label: "Reassess" },
  { key: "final", label: "Resolved" },
];

export function stageStatesForCase(caseDetail) {
  const decisions = caseDetail.decisions || [];
  const policyChecks = caseDetail.policy_checks || [];
  const executions = caseDetail.executions || [];
  const outcomes = caseDetail.outcomes || [];
  const status = caseDetail.status;

  const isTerminal = ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"].includes(status);
  const hasReassessed = decisions.length > 1;

  const states = {
    failure: "done",
    context: "done",
    decision: decisions.length ? "done" : "pending",
    policy: policyChecks.length ? "done" : "pending",
    action: executions.length ? "done" : "pending",
    outcome: outcomes.length ? "done" : "pending",
    reassess: hasReassessed ? "done" : status === "OPEN" && outcomes.length ? "active" : "pending",
    final: isTerminal ? "done" : "pending",
  };

  // mark the current active edge for a non-terminal case
  if (status === "OPEN") {
    if (!decisions.length) states.decision = "active";
    else if (!policyChecks.length) states.policy = "active";
    else if (!executions.length) states.action = "active";
    else if (!outcomes.length) states.outcome = "active";
  }

  const finalColor =
    status === "RECOVERED" ? SIGNAL.mint : status === "ESCALATED" ? SIGNAL.amber : status === "OPEN" ? SIGNAL.neutral : SIGNAL.red;

  return { states, finalColor, isTerminal };
}
