// Mirrors app/enums.py exactly. TRACE's action space and states are bounded --
// this file is the single source of truth for how each value is labeled and colored.

export const FailureType = {
  BANK_TIMEOUT: "BANK_TIMEOUT",
  CARD_DECLINED: "CARD_DECLINED",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  AUTH_FAILURE: "AUTH_FAILURE",
  PROCESSING_ERROR: "PROCESSING_ERROR",
};

export const FAILURE_LABELS = {
  BANK_TIMEOUT: "Bank timeout",
  CARD_DECLINED: "Card declined",
  INSUFFICIENT_FUNDS: "Insufficient funds",
  AUTH_FAILURE: "Auth failure",
  PROCESSING_ERROR: "Processing error",
};

export const ActionType = {
  RETRY_PAYMENT: "RETRY_PAYMENT",
  SEND_RECOVERY_LINK: "SEND_RECOVERY_LINK",
  SUGGEST_ALTERNATIVE_METHOD: "SUGGEST_ALTERNATIVE_METHOD",
  WAIT_AND_REASSESS: "WAIT_AND_REASSESS",
  ESCALATE_FOR_REVIEW: "ESCALATE_FOR_REVIEW",
  STOP_RECOVERY: "STOP_RECOVERY",
};

export const ACTION_LABELS = {
  RETRY_PAYMENT: "Retry payment",
  SEND_RECOVERY_LINK: "Send recovery link",
  SUGGEST_ALTERNATIVE_METHOD: "Suggest alternative method",
  WAIT_AND_REASSESS: "Wait and reassess",
  ESCALATE_FOR_REVIEW: "Escalate for review",
  STOP_RECOVERY: "Stop recovery",
};

export const DecisionType = {
  RECOVERY_WORTH_PURSUING: "RECOVERY_WORTH_PURSUING",
  NOT_WORTH_PURSUING: "NOT_WORTH_PURSUING",
};

export const PolicyResult = {
  APPROVED: "APPROVED",
  BLOCKED: "BLOCKED",
  FLAGGED_FOR_REVIEW: "FLAGGED_FOR_REVIEW",
};

export const CaseStatus = {
  OPEN: "OPEN",
  RECOVERED: "RECOVERED",
  STOPPED: "STOPPED",
  ESCALATED: "ESCALATED",
  EXPIRED: "EXPIRED",
};

export const CASE_STATUS_LABELS = {
  OPEN: "Open",
  RECOVERED: "Recovered",
  STOPPED: "Stopped",
  ESCALATED: "Escalated",
  EXPIRED: "Expired",
};

export const CustomerEngagement = {
  NONE: "NONE",
  LINK_SENT: "LINK_SENT",
  LINK_OPENED: "LINK_OPENED",
  LINK_CLICKED: "LINK_CLICKED",
  CONTACTED_MERCHANT: "CONTACTED_MERCHANT",
};

export const OutcomeType = {
  RECOVERED: "RECOVERED",
  NOT_RECOVERED: "NOT_RECOVERED",
  PENDING: "PENDING",
  NOT_APPLICABLE: "NOT_APPLICABLE",
};

export const ExecutionType = {
  REAL: "REAL",
  SIMULATED: "SIMULATED",
};

export const SystemType = {
  TRACE: "TRACE",
  BASELINE: "BASELINE",
};

// ---- Semantic color mapping (Signal Intelligence system) ----
// orange = TRACE activity / in-progress, mint = success/recovered,
// amber = waiting / review / uncertainty, red = failed / blocked / stopped.

export const STATUS_SIGNAL = {
  OPEN: "orange",
  RECOVERED: "mint",
  STOPPED: "red",
  ESCALATED: "amber",
  EXPIRED: "red",
};

export const POLICY_SIGNAL = {
  APPROVED: "mint",
  BLOCKED: "red",
  FLAGGED_FOR_REVIEW: "amber",
};

export const OUTCOME_SIGNAL = {
  RECOVERED: "mint",
  NOT_RECOVERED: "red",
  PENDING: "amber",
  NOT_APPLICABLE: "neutral",
};

export const DECISION_SIGNAL = {
  RECOVERY_WORTH_PURSUING: "orange",
  NOT_WORTH_PURSUING: "neutral",
};

// Tailwind class groups per signal name -- keeps color usage centralized & semantic only.
// NOTE: every class string here is written out in full (no runtime concatenation of
// partial utility + opacity modifier) so Tailwind's source scanner can find it.
export const SIGNAL_CLASSES = {
  orange: {
    text: "text-signal-orange",
    bg: "bg-signal-orange",
    dim: "bg-signal-orange-dim",
    border: "border-signal-orange",
    borderMuted: "border-signal-orange/40",
    dimMuted: "bg-signal-orange-dim/20",
    dot: "bg-signal-orange",
  },
  mint: {
    text: "text-signal-mint",
    bg: "bg-signal-mint",
    dim: "bg-signal-mint-dim",
    border: "border-signal-mint",
    borderMuted: "border-signal-mint/40",
    dimMuted: "bg-signal-mint-dim/20",
    dot: "bg-signal-mint",
  },
  amber: {
    text: "text-signal-amber",
    bg: "bg-signal-amber",
    dim: "bg-signal-amber-dim",
    border: "border-signal-amber",
    borderMuted: "border-signal-amber/40",
    dimMuted: "bg-signal-amber-dim/20",
    dot: "bg-signal-amber",
  },
  red: {
    text: "text-signal-red",
    bg: "bg-signal-red",
    dim: "bg-signal-red-dim",
    border: "border-signal-red",
    borderMuted: "border-signal-red/40",
    dimMuted: "bg-signal-red-dim/20",
    dot: "bg-signal-red",
  },
  neutral: {
    text: "text-ink-faint",
    bg: "bg-ink-faint",
    dim: "bg-mist",
    border: "border-mist-line",
    borderMuted: "border-mist-line/60",
    dimMuted: "bg-mist/20",
    dot: "bg-ink-faint",
  },
};

export const RECOVERY_LIFECYCLE_STAGES = [
  { key: "failure", label: "Failure" },
  { key: "context", label: "Context" },
  { key: "decision", label: "TRACE decision" },
  { key: "policy", label: "Policy" },
  { key: "action", label: "Action" },
  { key: "outcome", label: "Outcome" },
  { key: "reassess", label: "Reassess" },
  { key: "final", label: "Recovered / Adapt / Stop" },
];
