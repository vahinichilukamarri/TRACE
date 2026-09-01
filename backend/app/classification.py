"""
Failure classification (spec section 7).

Deterministic mapping is tried first and is always preferred when a
structured failure code is available -- there is no reason to spend an
LLM call on something a lookup table already answers reliably.

The LLM path is only used for ambiguous free-text failure messages, and
if that call is unavailable/fails, we do NOT guess a specific category --
we fall back to PROCESSING_ERROR with a low confidence score, exactly as
spec section 20 requires.
"""
from dataclasses import dataclass

from app.enums import FailureType, ClassificationMethod
from app.config import settings

# --- Deterministic structured-code mapping -------------------------------

STRUCTURED_CODE_MAP = {
    "BANK_503": FailureType.BANK_TIMEOUT,
    "BANK_TIMEOUT": FailureType.BANK_TIMEOUT,
    "GATEWAY_TIMEOUT": FailureType.BANK_TIMEOUT,
    "ISSUER_TIMEOUT": FailureType.BANK_TIMEOUT,

    "CARD_DECLINED": FailureType.CARD_DECLINED,
    "DO_NOT_HONOR": FailureType.CARD_DECLINED,
    "CARD_EXPIRED": FailureType.CARD_DECLINED,
    "CARD_RESTRICTED": FailureType.CARD_DECLINED,

    "INSUFFICIENT_FUNDS": FailureType.INSUFFICIENT_FUNDS,
    "INSUFFICIENT_BALANCE": FailureType.INSUFFICIENT_FUNDS,

    "AUTH_FAILURE": FailureType.AUTH_FAILURE,
    "OTP_FAILED": FailureType.AUTH_FAILURE,
    "3DS_FAILED": FailureType.AUTH_FAILURE,
    "AUTHENTICATION_FAILED": FailureType.AUTH_FAILURE,

    "PROCESSING_ERROR": FailureType.PROCESSING_ERROR,
    "UNKNOWN": FailureType.PROCESSING_ERROR,
}

# Keyword heuristics used as the offline fallback for free-text messages
# when no LLM is available -- deliberately conservative.
_KEYWORDS = {
    FailureType.BANK_TIMEOUT: ["timeout", "temporary restriction", "issuer's end", "try again later", "gateway"],
    FailureType.CARD_DECLINED: ["declined", "do not honor", "card is invalid", "expired card", "restricted card"],
    FailureType.INSUFFICIENT_FUNDS: ["insufficient", "not enough balance", "low balance",
                                      "sufficient balance", "does not have sufficient"],
    FailureType.AUTH_FAILURE: ["otp", "authentication", "3ds", "verification failed", "incorrect pin"],
}


@dataclass
class ClassificationResult:
    failure_type: FailureType
    confidence: float
    method: ClassificationMethod
    raw_message: str | None = None


def classify_structured(code: str) -> ClassificationResult | None:
    normalized = code.strip().upper()
    if normalized in STRUCTURED_CODE_MAP:
        return ClassificationResult(
            failure_type=STRUCTURED_CODE_MAP[normalized],
            confidence=1.0,
            method=ClassificationMethod.DETERMINISTIC,
        )
    return None


def _keyword_classify(message: str) -> ClassificationResult:
    lowered = message.lower()
    best_type, best_hits = None, 0
    for ftype, kws in _KEYWORDS.items():
        hits = sum(1 for kw in kws if kw in lowered)
        if hits > best_hits:
            best_type, best_hits = ftype, hits
    if best_type is None:
        return ClassificationResult(
            failure_type=FailureType.PROCESSING_ERROR,
            confidence=0.3,
            method=ClassificationMethod.LLM_FALLBACK,
            raw_message=message,
        )
    # confidence scales modestly with number of matched keyword signals
    confidence = min(0.55 + 0.15 * best_hits, 0.85)
    return ClassificationResult(
        failure_type=best_type,
        confidence=confidence,
        method=ClassificationMethod.LLM_FALLBACK,
        raw_message=message,
    )


# A live classification may call out to Groq. Bound it hard: without an
# explicit timeout/retry cap the SDK retries with multi-second backoff, and
# because classification happens inside an open DB write transaction a slow
# call stalls the request and holds the SQLite writer lock.
LLM_CLASSIFY_TIMEOUT_SECONDS = 10.0
LLM_CLASSIFY_MAX_RETRIES = 0


def _llm_classify(message: str) -> ClassificationResult | None:
    """Attempt a real LLM classification call. Returns None on any failure
    so the caller can apply the safe fallback rather than guess."""
    if not settings.GROQ_API_KEY:
        return None
    try:
        from groq import Groq
        client = Groq(
            api_key=settings.GROQ_API_KEY,
            timeout=LLM_CLASSIFY_TIMEOUT_SECONDS,
            max_retries=LLM_CLASSIFY_MAX_RETRIES,
        )
        prompt = (
            "Classify this payment failure message into exactly one of: "
            "BANK_TIMEOUT, CARD_DECLINED, INSUFFICIENT_FUNDS, AUTH_FAILURE, PROCESSING_ERROR.\n"
            f'Message: "{message}"\n\n'
            'Respond with ONLY a JSON object: {"failure_type": "...", "confidence": 0.0}'
        )
        resp = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.choices[0].message.content or ""
        import json
        text = text.strip().strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
        data = json.loads(text)
        ftype = FailureType(data["failure_type"])
        confidence = float(data.get("confidence", 0.7))
        return ClassificationResult(
            failure_type=ftype,
            confidence=confidence,
            method=ClassificationMethod.LLM,
            raw_message=message,
        )
    except Exception:
        return None


def classify_failure(failure_code: str | None, failure_message: str | None,
                      allow_llm: bool = True) -> ClassificationResult:
    """Public entry point. Structured code wins when present; otherwise
    attempt LLM classification of the free-text message; otherwise fall
    back to conservative keyword heuristics.

    allow_llm=False forces the deterministic keyword path. Batch evaluation
    uses this: a network call per case makes a 300-case run take ~10 minutes
    and, worse, makes the benchmark non-reproducible -- the whole point of
    the harness is that TRACE and the baseline see identical inputs."""
    if failure_code:
        result = classify_structured(failure_code)
        if result:
            return result

    if failure_message:
        if allow_llm:
            llm_result = _llm_classify(failure_message)
            if llm_result:
                return llm_result
        return _keyword_classify(failure_message)

    # No signal at all -- safest possible fallback, never guess.
    return ClassificationResult(
        failure_type=FailureType.PROCESSING_ERROR,
        confidence=0.2,
        method=ClassificationMethod.LLM_FALLBACK,
    )
