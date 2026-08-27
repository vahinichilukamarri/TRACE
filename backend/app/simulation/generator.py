"""
Synthetic recovery-case dataset generator (spec section 14).

Produces reproducible (seeded) synthetic payment-failure events with
realistic-ish distributions, covering the full range of "easy win" to
"not worth pursuing" cases described in spec section 3 (Case A / Case B).
"""
import json
import random
import csv
from pathlib import Path
from dataclasses import dataclass, asdict

from app.enums import FailureType, CustomerEngagement

FAILURE_TYPE_WEIGHTS = {
    FailureType.BANK_TIMEOUT: 0.30,
    FailureType.CARD_DECLINED: 0.28,
    FailureType.INSUFFICIENT_FUNDS: 0.18,
    FailureType.AUTH_FAILURE: 0.16,
    FailureType.PROCESSING_ERROR: 0.08,
}

RAW_MESSAGES = {
    FailureType.BANK_TIMEOUT: [
        "Transaction could not be completed because of a temporary restriction at the issuer's end.",
        "The payment gateway timed out while contacting the bank.",
        None,  # sometimes we only have a structured code
    ],
    FailureType.CARD_DECLINED: [
        "The card issuer declined this transaction.",
        "Do not honor - card declined by issuing bank.",
        None,
    ],
    FailureType.INSUFFICIENT_FUNDS: [
        "The account does not have sufficient balance to complete this payment.",
        None,
    ],
    FailureType.AUTH_FAILURE: [
        "Customer failed OTP verification during checkout.",
        "3DS authentication was not completed successfully.",
        None,
    ],
    FailureType.PROCESSING_ERROR: [
        "An unexpected error occurred while processing the transaction.",
        None,
    ],
}

STRUCTURED_CODES = {
    FailureType.BANK_TIMEOUT: ["BANK_503", "GATEWAY_TIMEOUT", "ISSUER_TIMEOUT"],
    FailureType.CARD_DECLINED: ["CARD_DECLINED", "DO_NOT_HONOR"],
    FailureType.INSUFFICIENT_FUNDS: ["INSUFFICIENT_FUNDS"],
    FailureType.AUTH_FAILURE: ["AUTH_FAILURE", "OTP_FAILED", "3DS_FAILED"],
    FailureType.PROCESSING_ERROR: ["PROCESSING_ERROR"],
}


@dataclass
class SyntheticCase:
    payment_id: str
    amount: float
    currency: str
    failure_code: str | None
    failure_message: str | None
    customer_success_rate: float
    previous_failures: int
    previous_recovery_attempts: int
    previous_recovery_action: str | None
    previous_outcome: str | None
    customer_engagement: str
    time_since_failure_minutes: int
    remaining_recovery_opportunities: int
    true_failure_type: str  # ground truth label, useful for evaluating the classifier separately


def _weighted_choice(rng: random.Random, weights: dict):
    items = list(weights.keys())
    probs = list(weights.values())
    return rng.choices(items, weights=probs, k=1)[0]


def _sample_amount(rng: random.Random) -> float:
    # Lognormal-ish distribution: many small/medium transactions, a long tail of large ones.
    base = rng.lognormvariate(mu=7.5, sigma=1.1)  # centers around a few thousand INR
    return round(min(max(base, 50), 500000), 2)


def _sample_success_rate(rng: random.Random) -> float:
    # Beta distribution skewed toward "decent" customers but with a real spread.
    return round(rng.betavariate(2.2, 2.0), 3)


def generate_case(rng: random.Random, index: int) -> SyntheticCase:
    failure_type = _weighted_choice(rng, FAILURE_TYPE_WEIGHTS)
    amount = _sample_amount(rng)
    success_rate = _sample_success_rate(rng)

    previous_failures = rng.choices([0, 1, 2, 3], weights=[0.55, 0.25, 0.12, 0.08])[0]
    previous_recovery_attempts = min(previous_failures, rng.choices([0, 1, 2], weights=[0.6, 0.3, 0.1])[0])

    previous_recovery_action = None
    previous_outcome = None
    if previous_recovery_attempts > 0:
        previous_recovery_action = rng.choice(
            ["RETRY_PAYMENT", "SEND_RECOVERY_LINK", "SUGGEST_ALTERNATIVE_METHOD", "WAIT_AND_REASSESS"]
        )
        previous_outcome = "FAILED"  # if it were RECOVERED the case wouldn't still be open

    engagement = CustomerEngagement.NONE.value
    if previous_recovery_action in ("SEND_RECOVERY_LINK", "SUGGEST_ALTERNATIVE_METHOD"):
        engagement = rng.choices(
            [CustomerEngagement.NONE.value, CustomerEngagement.LINK_SENT.value,
             CustomerEngagement.LINK_OPENED.value, CustomerEngagement.LINK_CLICKED.value],
            weights=[0.35, 0.30, 0.20, 0.15],
        )[0]

    time_since_failure = rng.randint(5, 2880)  # up to 2 days
    remaining_opportunities = max(0, 3 - previous_recovery_attempts) if rng.random() > 0.05 else 0

    use_structured = rng.random() < 0.7
    failure_code = rng.choice(STRUCTURED_CODES[failure_type]) if use_structured else None
    failure_message = None if use_structured else rng.choice(
        [m for m in RAW_MESSAGES[failure_type] if m]
    )
    if not use_structured and failure_message is None:
        failure_message = "Payment could not be processed due to an unspecified issue."

    return SyntheticCase(
        payment_id=f"PAY_SIM_{index:06d}",
        amount=amount,
        currency="INR",
        failure_code=failure_code,
        failure_message=failure_message,
        customer_success_rate=success_rate,
        previous_failures=previous_failures,
        previous_recovery_attempts=previous_recovery_attempts,
        previous_recovery_action=previous_recovery_action,
        previous_outcome=previous_outcome,
        customer_engagement=engagement,
        time_since_failure_minutes=time_since_failure,
        remaining_recovery_opportunities=remaining_opportunities,
        true_failure_type=failure_type.value,
    )


def generate_dataset(n: int, seed: int) -> list[SyntheticCase]:
    rng = random.Random(seed)
    return [generate_case(rng, i) for i in range(1, n + 1)]


def save_dataset(cases: list[SyntheticCase], out_dir: Path, basename: str = "synthetic_cases") -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{basename}.json"
    csv_path = out_dir / f"{basename}.csv"

    records = [asdict(c) for c in cases]
    json_path.write_text(json.dumps(records, indent=2))

    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)

    return json_path, csv_path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=300)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default="data")
    args = parser.parse_args()

    cases = generate_dataset(args.n, args.seed)
    json_path, csv_path = save_dataset(cases, Path(args.out))
    print(f"Generated {len(cases)} synthetic cases -> {json_path}, {csv_path}")
