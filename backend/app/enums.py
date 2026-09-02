"""
Domain enums for TRACE.

Keeping these as plain str-Enums (not a free-form LLM vocabulary) is what
makes the action space *bounded*: the agent can only ever select a member
of ActionType, the policy layer can only ever return a member of
PolicyResult, etc. Nothing downstream has to guess about valid values.
"""

from enum import Enum


class FailureType(str, Enum):
    BANK_TIMEOUT = "BANK_TIMEOUT"
    CARD_DECLINED = "CARD_DECLINED"
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS"
    AUTH_FAILURE = "AUTH_FAILURE"
    PROCESSING_ERROR = "PROCESSING_ERROR"  # fallback / unknown bucket


class ClassificationMethod(str, Enum):
    DETERMINISTIC = "DETERMINISTIC"
    LLM = "LLM"
    LLM_FALLBACK = "LLM_FALLBACK"  # LLM unavailable -> safe fallback used


class ActionType(str, Enum):
    RETRY_PAYMENT = "RETRY_PAYMENT"
    SEND_RECOVERY_LINK = "SEND_RECOVERY_LINK"
    SUGGEST_ALTERNATIVE_METHOD = "SUGGEST_ALTERNATIVE_METHOD"
    WAIT_AND_REASSESS = "WAIT_AND_REASSESS"
    ESCALATE_FOR_REVIEW = "ESCALATE_FOR_REVIEW"
    STOP_RECOVERY = "STOP_RECOVERY"


class DecisionType(str, Enum):
    RECOVERY_WORTH_PURSUING = "RECOVERY_WORTH_PURSUING"
    NOT_WORTH_PURSUING = "NOT_WORTH_PURSUING"


class PolicyResult(str, Enum):
    APPROVED = "APPROVED"
    BLOCKED = "BLOCKED"
    FLAGGED_FOR_REVIEW = "FLAGGED_FOR_REVIEW"


class CaseStatus(str, Enum):
    OPEN = "OPEN"
    RECOVERED = "RECOVERED"
    STOPPED = "STOPPED"
    ESCALATED = "ESCALATED"
    EXPIRED = "EXPIRED"


class CustomerEngagement(str, Enum):
    NONE = "NONE"
    LINK_SENT = "LINK_SENT"
    LINK_OPENED = "LINK_OPENED"
    LINK_CLICKED = "LINK_CLICKED"
    CONTACTED_MERCHANT = "CONTACTED_MERCHANT"


class OutcomeType(str, Enum):
    RECOVERED = "RECOVERED"
    NOT_RECOVERED = "NOT_RECOVERED"
    PENDING = "PENDING"
    NOT_APPLICABLE = "NOT_APPLICABLE"  # e.g. for STOP_RECOVERY / ESCALATE


class ExecutionType(str, Enum):
    REAL = "REAL"
    SIMULATED = "SIMULATED"


class AuditEventType(str, Enum):
    CASE_CREATED = "CASE_CREATED"
    DUPLICATE_EVENT = "DUPLICATE_EVENT"
    CLASSIFIED = "CLASSIFIED"
    AGENT_DECISION = "AGENT_DECISION"
    AGENT_FALLBACK = "AGENT_FALLBACK"
    POLICY_CHECK = "POLICY_CHECK"
    EXECUTION = "EXECUTION"
    OUTCOME = "OUTCOME"
    REASSESSMENT = "REASSESSMENT"
    STATUS_CHANGE = "STATUS_CHANGE"
    CUSTOMER_ENGAGEMENT = "CUSTOMER_ENGAGEMENT"


class SystemType(str, Enum):
    TRACE = "TRACE"
    BASELINE = "BASELINE"


class AgentMode(str, Enum):
    HEURISTIC = "HEURISTIC"  # deterministic scoring engine, no API calls
    LLM = "LLM"  # real Groq API call, structured output
    ROUTED = "ROUTED"  # per-case: heuristic first, escalate to LLM when it earns its cost
    # NOTE: ROUTED is a *dispatch* mode, never a result. The agent_mode
    # persisted on a decision is always the engine that actually decided.
