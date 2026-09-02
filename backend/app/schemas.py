from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


class PaymentEventIn(BaseModel):
    """Inbound payment-failure event, as it would arrive from a payments system."""
    payment_id: str
    amount: float
    currency: str = "INR"

    # Failure signal: EITHER a structured code OR a raw free-text message
    failure_code: Optional[str] = None
    failure_message: Optional[str] = None

    customer_success_rate: float = Field(0.5, ge=0, le=1)
    previous_failures: int = 0
    previous_recovery_attempts: int = 0
    previous_recovery_action: Optional[str] = None
    previous_outcome: Optional[str] = None
    customer_engagement: str = "NONE"
    time_since_failure_minutes: int = 0
    remaining_recovery_opportunities: int = 3

    # Optional -- leave unset for normal fake-placeholder behavior. Set this
    # to a real address only when you deliberately want to receive an actual
    # recovery email for demo/testing purposes.
    customer_email: Optional[str] = None

    source: str = "live"


class ClickEventIn(BaseModel):
    payment_id: str


class AgentDecisionOut(BaseModel):
    decision: str
    action: str
    confidence: float
    reasoning: str
    agent_mode: str
    is_fallback: bool
    iteration: int
    expected_value: Optional[float] = None
    intervention_cost: Optional[float] = None
    net_expected_value: Optional[float] = None
    route_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PolicyCheckOut(BaseModel):
    proposed_action: str
    result: str
    reasons: Any
    final_action: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ExecutionOut(BaseModel):
    action: str
    execution_type: str
    status: str
    details: Any
    created_at: datetime

    class Config:
        from_attributes = True


class OutcomeOut(BaseModel):
    outcome: str
    simulated: bool
    revenue_recovered: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    event_type: str
    payload: Any
    notes: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


class CaseOut(BaseModel):
    payment_id: str
    amount: float
    currency: str
    failure_type: Optional[str]
    classification_confidence: Optional[float]
    classification_method: Optional[str]
    customer_success_rate: float
    previous_failures: int
    previous_recovery_attempts: int
    previous_recovery_action: Optional[str]
    previous_outcome: Optional[str]
    customer_engagement: str
    time_since_failure_minutes: int
    remaining_recovery_opportunities: int
    customer_email: Optional[str]
    status: str
    source: str
    system: str
    revenue_recovered: Optional[float]
    revenue_recovered_simulated: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CaseDetailOut(CaseOut):
    decisions: list[AgentDecisionOut] = []
    policy_checks: list[PolicyCheckOut] = []
    executions: list[ExecutionOut] = []
    outcomes: list[OutcomeOut] = []
    audit_log: list[AuditLogOut] = []


class ProcessResultOut(BaseModel):
    payment_id: str
    status: str
    decision: Optional[AgentDecisionOut]
    policy: Optional[PolicyCheckOut]
    execution: Optional[ExecutionOut]
    outcome: Optional[OutcomeOut]
    duplicate: bool = False


class EvaluationRunRequest(BaseModel):
    dataset_size: int = 300
    seed: Optional[int] = None
    use_existing_dataset: bool = False
    # Optional: route the first `demo_email_count` TRACE cases in this batch
    # to a real address instead of the usual fake placeholder, so you can
    # watch an actual recovery email land in your inbox during a live demo.
    # These cases are otherwise ordinary random synthetic cases -- not
    # guaranteed to result in an email-sending action, since not every
    # failure type/history combination leads to SEND_RECOVERY_LINK or
    # SUGGEST_ALTERNATIVE_METHOD.
    demo_email: Optional[str] = None
    demo_email_count: int = 1


class EvaluationRunOut(BaseModel):
    run_id: str
    dataset_size: int
    seed: Optional[int]
    created_at: datetime
    results: dict  # {"TRACE": {...metrics}, "BASELINE": {...metrics}}
