"""
ORM models.

Design note: RecoveryCase is the single mutable "current state" record for
a payment_id. Everything that happens to it (decisions, policy checks,
executions, outcomes, reassessments) is additionally appended to
AuditLogEntry as an immutable, ordered trail — that's what lets us fully
explain any case after the fact (spec section 18).
"""
import uuid
import json
from datetime import datetime

from sqlalchemy import (
    Column, String, Float, Integer, DateTime, Text, ForeignKey, Boolean, JSON
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class RecoveryCase(Base):
    __tablename__ = "recovery_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_id = Column(String, unique=True, index=True, nullable=False)

    # Core transaction context
    amount = Column(Float, nullable=False)
    currency = Column(String, default="INR")
    failure_type = Column(String, nullable=True)  # FailureType, set after classification
    failure_raw_message = Column(Text, nullable=True)
    classification_confidence = Column(Float, nullable=True)
    classification_method = Column(String, nullable=True)

    customer_success_rate = Column(Float, default=0.5)
    previous_failures = Column(Integer, default=0)
    previous_recovery_attempts = Column(Integer, default=0)
    previous_recovery_action = Column(String, nullable=True)
    previous_outcome = Column(String, nullable=True)
    customer_engagement = Column(String, default="NONE")
    time_since_failure_minutes = Column(Integer, default=0)
    remaining_recovery_opportunities = Column(Integer, default=3)

    status = Column(String, default="OPEN", index=True)
    source = Column(String, default="live")  # "live" | "simulation"
    system = Column(String, default="TRACE")  # "TRACE" | "BASELINE" (which engine owns this case)
    eval_run_id = Column(String, nullable=True, index=True)  # scopes a case to a specific batch evaluation run

    revenue_recovered = Column(Float, nullable=True)
    revenue_recovered_simulated = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    audit_logs = relationship("AuditLogEntry", back_populates="case", cascade="all, delete-orphan")
    decisions = relationship("AgentDecisionRecord", back_populates="case", cascade="all, delete-orphan")
    policy_checks = relationship("PolicyCheckRecord", back_populates="case", cascade="all, delete-orphan")
    executions = relationship("ExecutionRecord", back_populates="case", cascade="all, delete-orphan")
    outcomes = relationship("OutcomeRecord", back_populates="case", cascade="all, delete-orphan")

    def to_context_dict(self) -> dict:
        """The bounded context view handed to the classifier / agent / policy."""
        return {
            "payment_id": self.payment_id,
            "amount": self.amount,
            "currency": self.currency,
            "failure_type": self.failure_type,
            "classification_confidence": self.classification_confidence,
            "customer_success_rate": self.customer_success_rate,
            "previous_failures": self.previous_failures,
            "previous_recovery_attempts": self.previous_recovery_attempts,
            "previous_recovery_action": self.previous_recovery_action,
            "previous_outcome": self.previous_outcome,
            "customer_engagement": self.customer_engagement,
            "time_since_failure_minutes": self.time_since_failure_minutes,
            "remaining_recovery_opportunities": self.remaining_recovery_opportunities,
            "status": self.status,
        }


class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
    event_type = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    case = relationship("RecoveryCase", back_populates="audit_logs")


class AgentDecisionRecord(Base):
    __tablename__ = "agent_decisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
    decision = Column(String, nullable=False)       # DecisionType
    action = Column(String, nullable=False)          # ActionType
    confidence = Column(Float, nullable=False)
    reasoning = Column(Text, nullable=True)
    agent_mode = Column(String, nullable=False)       # HEURISTIC | LLM
    is_fallback = Column(Boolean, default=False)
    iteration = Column(Integer, default=0)            # 0 = first decision, 1+ = reassessment
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("RecoveryCase", back_populates="decisions")


class PolicyCheckRecord(Base):
    __tablename__ = "policy_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
    decision_id = Column(Integer, ForeignKey("agent_decisions.id"), nullable=True)
    proposed_action = Column(String, nullable=False)
    result = Column(String, nullable=False)  # PolicyResult
    reasons = Column(JSON, nullable=True)
    final_action = Column(String, nullable=True)  # action actually cleared for execution (may differ if forced)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("RecoveryCase", back_populates="policy_checks")


class ExecutionRecord(Base):
    __tablename__ = "executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
    action = Column(String, nullable=False)
    execution_type = Column(String, nullable=False)  # REAL | SIMULATED
    status = Column(String, nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("RecoveryCase", back_populates="executions")
    outcomes = relationship("OutcomeRecord", back_populates="execution")


class OutcomeRecord(Base):
    __tablename__ = "outcomes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
    execution_id = Column(Integer, ForeignKey("executions.id"), nullable=True)
    outcome = Column(String, nullable=False)  # OutcomeType
    simulated = Column(Boolean, default=True)
    revenue_recovered = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    case = relationship("RecoveryCase", back_populates="outcomes")
    execution = relationship("ExecutionRecord", back_populates="outcomes")


class ProcessedEvent(Base):
    """Idempotency ledger: one row per payment_id event we've ever accepted."""
    __tablename__ = "processed_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payment_id = Column(String, unique=True, index=True, nullable=False)
    case_id = Column(Integer, ForeignKey("recovery_cases.id"), nullable=False)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    duplicate_count = Column(Integer, default=0)


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String, unique=True, default=gen_uuid, index=True)
    dataset_size = Column(Integer, nullable=False)
    seed = Column(Integer, nullable=True)
    config = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    results = relationship("EvaluationResult", back_populates="run", cascade="all, delete-orphan")


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("evaluation_runs.id"), nullable=False)
    system = Column(String, nullable=False)  # TRACE | BASELINE
    metrics = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("EvaluationRun", back_populates="results")
