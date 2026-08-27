from app.classification import classify_failure, classify_structured
from app.enums import FailureType, ClassificationMethod


def test_structured_code_deterministic():
    result = classify_failure("BANK_503", None)
    assert result.failure_type == FailureType.BANK_TIMEOUT
    assert result.confidence == 1.0
    assert result.method == ClassificationMethod.DETERMINISTIC


def test_unknown_structured_code_falls_through():
    assert classify_structured("TOTALLY_MADE_UP_CODE") is None


def test_freetext_keyword_fallback_bank_timeout():
    result = classify_failure(None, "Transaction could not be completed because of a temporary restriction at the issuer's end.")
    assert result.failure_type == FailureType.BANK_TIMEOUT
    assert 0 < result.confidence <= 1


def test_freetext_keyword_fallback_insufficient_funds():
    result = classify_failure(None, "The account does not have sufficient balance to complete this payment.")
    assert result.failure_type == FailureType.INSUFFICIENT_FUNDS


def test_no_signal_returns_low_confidence_processing_error():
    result = classify_failure(None, None)
    assert result.failure_type == FailureType.PROCESSING_ERROR
    assert result.confidence < 0.35


def test_gibberish_message_does_not_get_falsely_confident():
    result = classify_failure(None, "xkjhasd asdkjhas asdkjh")
    assert result.failure_type == FailureType.PROCESSING_ERROR
    assert result.confidence < 0.5
