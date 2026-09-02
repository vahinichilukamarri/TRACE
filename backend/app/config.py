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
