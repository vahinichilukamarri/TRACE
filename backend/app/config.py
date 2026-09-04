"""
Central configuration, all overridable via environment variables / .env.
"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off", "")


class Settings:
    # --- Database ---
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'trace.db'}")

    # --- Agent ---
    AGENT_MODE: str = os.getenv("AGENT_MODE", "HEURISTIC")  # HEURISTIC | LLM
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    AGENT_MIN_CONFIDENCE: float = float(os.getenv("AGENT_MIN_CONFIDENCE", "0.5"))

    # --- ROUTED mode: when is an LLM call worth its cost? ---
    # The heuristic runs first on every case (free, deterministic). These
    # thresholds decide when its answer is not trustworthy enough to stand on
    # its own and a real reasoning call earns the ~Rs 0.50 it costs.
    # Below this classification confidence the heuristic is picking actions
    # from a table keyed on a failure_type that is itself a guess.
    LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE: float = float(
        os.getenv("LLM_ROUTE_MIN_CLASSIFICATION_CONFIDENCE", "0.6"))
    # If the top two candidate actions are within this fraction of each other,
    # the argmax is separating noise, not signal. Kept tight (5%): the scoring
    # formula multiplies base_fit by terms identical across a case's candidates,
    # so the top-two gap collapses to a per-failure-type constant. At 10% this
    # trigger degenerated into a failure-type lookup (91% of CARD_DECLINED, 0%
    # of BANK_TIMEOUT) rather than a per-case signal.
    LLM_ROUTE_EV_MARGIN_PCT: float = float(os.getenv("LLM_ROUTE_EV_MARGIN_PCT", "0.05"))
    # High-value transactions that have already failed at least this many
    # recovery attempts: the expected cost of being wrong dwarfs inference cost.
    LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS: int = int(
        os.getenv("LLM_ROUTE_HIGH_VALUE_MIN_ATTEMPTS", "1"))
    # Route when the case carries history the fit table structurally cannot
    # represent. _ACTION_FIT is keyed on failure_type alone -- it encodes nothing
    # about what was already tried or how the customer responded, so a case with
    # a failed prior attempt (or a click that never converted) is exactly where
    # the heuristic is blind and real reasoning has something to add.
    LLM_ROUTE_ON_PRIOR_EVIDENCE: bool = _env_bool("LLM_ROUTE_ON_PRIOR_EVIDENCE", True)

    # --- LLM call resilience ---
    # A 429 is transient back-pressure, not a reasoning failure, so it is the one
    # error class worth retrying. Everything else (auth, parse, empty content,
    # invented action) is deterministic -- retrying it just burns the TPM budget
    # and delays the fallback.
    LLM_RATE_LIMIT_MAX_RETRIES: int = int(os.getenv("LLM_RATE_LIMIT_MAX_RETRIES", "2"))
    # Backoff between retries: base, then base*multiplier (0.5s, then 1.5s).
    LLM_RATE_LIMIT_BACKOFF_SECONDS: float = float(
        os.getenv("LLM_RATE_LIMIT_BACKOFF_SECONDS", "0.5"))
    LLM_RATE_LIMIT_BACKOFF_MULTIPLIER: float = float(
        os.getenv("LLM_RATE_LIMIT_BACKOFF_MULTIPLIER", "3.0"))
    # Hard ceiling on ONE decision call including every retry and backoff sleep.
    # Retries must never let a request stall: the whole attempt chain stays
    # inside this budget, and a retry is skipped if it would not fit.
    LLM_CALL_MAX_WALL_CLOCK_SECONDS: float = float(
        os.getenv("LLM_CALL_MAX_WALL_CLOCK_SECONDS", "15.0"))

    # --- Policy ---
    MAX_RECOVERY_ATTEMPTS: int = int(os.getenv("MAX_RECOVERY_ATTEMPTS", "3"))
    RECOVERY_WINDOW_MINUTES: int = int(os.getenv("RECOVERY_WINDOW_MINUTES", "4320"))  # 3 days
    # NPCI mandates auto-reversal of most failed UPI transactions within ~60
    # minutes. BANK_TIMEOUT is our proxy for a bank / UPI-rail failure, so
    # continuing automated recovery past that point is moot -- the money has
    # already been reversed to the customer by the rail itself. Every other
    # failure type keeps the 3-day default above, since none of them has an
    # equivalent regulatory auto-reversal.
    RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT: int = int(os.getenv("RECOVERY_WINDOW_MINUTES_BANK_TIMEOUT", "60"))
    MAX_SAME_ACTION_REPEATS: int = int(os.getenv("MAX_SAME_ACTION_REPEATS", "1"))
    HIGH_VALUE_THRESHOLD: float = float(os.getenv("HIGH_VALUE_THRESHOLD", "50000"))
    POLICY_MIN_CONFIDENCE: float = float(os.getenv("POLICY_MIN_CONFIDENCE", "0.4"))

    # --- Reassessment loop bound (safety: never allow unbounded loops) ---
    MAX_REASSESSMENT_ITERATIONS: int = int(os.getenv("MAX_REASSESSMENT_ITERATIONS", "4"))

    # --- Email ---
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    # Hard ceiling on any SMTP round trip. Without a timeout smtplib blocks
    # forever on a throttled/unreachable server -- and because the send happens
    # inside an open DB write transaction, that also strands the SQLite writer
    # lock and wedges every later run with "database is locked".
    SMTP_TIMEOUT_SECONDS: int = int(os.getenv("SMTP_TIMEOUT_SECONDS", "15"))
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "recovery@trace-demo.example")
    RECOVERY_LINK_BASE_URL: str = os.getenv("RECOVERY_LINK_BASE_URL", "http://localhost:8000/pay")

    # --- Simulation ---
    SIMULATION_SEED: int = int(os.getenv("SIMULATION_SEED", "42"))
    DEFAULT_BATCH_SIZE: int = int(os.getenv("DEFAULT_BATCH_SIZE", "300"))

    # --- Startup auto-seed ---
    # A freshly deployed instance has an empty database, so every dashboard
    # endpoint 404s and the app opens looking broken. Seed one evaluation run
    # on boot so a deployed link always lands on real, populated data.
    # Set AUTO_SEED_ON_STARTUP=false to skip it (e.g. local development).
    AUTO_SEED_ON_STARTUP: bool = _env_bool("AUTO_SEED_ON_STARTUP", True)
    AUTO_SEED_SIZE: int = int(os.getenv("AUTO_SEED_SIZE", str(DEFAULT_BATCH_SIZE)))

    # --- App ---
    APP_NAME: str = "TRACE"
    CORS_ORIGINS: list = ["*"]


settings = Settings()
