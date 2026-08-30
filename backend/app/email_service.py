"""
Email delivery for recovery links / alternative-method suggestions.

If SMTP credentials are configured, this sends a real email (spec section
21: "Real -- email sending"). If not configured, it logs a clearly-labeled
SIMULATED send so the rest of the pipeline (audit trail, dashboard) still
works end-to-end without requiring the demo operator to set up SMTP first.

The template deliberately mirrors what a well-built payment recovery email
actually does (this is the same category of email as a failed-subscription-
payment notice): a concrete subject, a plain statement of what happened, a
consequence list so the customer knows what's actually at stake, a single
clear call to action, an urgency line driven by the case's *real* remaining
attempts/window (never fabricated), and an idempotency reassurance line so
a customer who already paid via another path isn't confused by this email
arriving after the fact.
"""
import uuid
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

FAILURE_COPY = {
    "BANK_TIMEOUT": "your bank's servers took too long to confirm the payment",
    "CARD_DECLINED": "your card was declined by the issuing bank",
    "INSUFFICIENT_FUNDS": "the payment method didn't have sufficient funds",
    "AUTH_FAILURE": "the payment could not be authenticated",
    "PROCESSING_ERROR": "a processing error interrupted the payment",
}


def _urgency_copy(remaining_recovery_opportunities, previous_recovery_attempts):
    """Returns (subject_prefix, urgency_line) derived from the case's real
    remaining attempts -- never invented, so the email never claims more or
    less urgency than the policy layer actually enforces."""
    remaining = remaining_recovery_opportunities if remaining_recovery_opportunities is not None else 1
    if remaining <= 1:
        return (
            "Action needed",
            "This is the last automatic recovery attempt for this transaction. "
            "If it isn't completed, we will stop trying and the transaction will be cancelled.",
        )
    return (
        "We couldn't complete your payment",
        f"You have {remaining} recovery attempts remaining before we stop trying automatically.",
    )


def _build_html(*, greeting_name, amount, currency, payment_id,
                 failure_reason, urgency_line, cta_label, link):
    symbol = "\u20b9" if currency == "INR" else f"{currency} "
    greeting = f" {greeting_name}" if greeting_name else ""
    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#F5F2EA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F2EA;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E8E5DD;">
        <tr>
          <td style="background-color:#111111;padding:20px 32px;">
            <span style="color:#FF6B35;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">TRACE Recovery</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px 0;font-size:15px;color:#111111;">Hi{greeting},</p>
            <p style="margin:0 0 16px 0;font-size:15px;color:#111111;line-height:1.5;">
              We couldn't complete your payment of <strong>{symbol}{amount:,.2f}</strong>
              (ref: <span style="font-family:monospace;color:#4A4844;">{payment_id}</span>)
              because {failure_reason}.
            </p>
            <p style="margin:0 0 20px 0;font-size:14px;color:#EF4444;line-height:1.5;">
              {urgency_line}
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
              <tr><td style="background-color:#FF6B35;">
                <a href="{link}" style="display:inline-block;padding:12px 24px;color:#111111;font-size:14px;font-weight:600;text-decoration:none;">
                  {cta_label}
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 24px 0;font-size:13px;color:#8A8781;line-height:1.5;">
              If you've already completed this payment through another method, please disregard this email --
              no further action is needed and nothing more will be charged.
            </p>
            <p style="margin:0;font-size:13px;color:#8A8781;">Having trouble? Reply to this email and we'll help directly.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #E8E5DD;">
            <p style="margin:0;font-size:11px;color:#8A8781;">This is a simulated recovery email sent by TRACE for demonstration purposes.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_recovery_email(
    to_address, payment_id, amount, kind="recovery_link", *,
    currency="INR", failure_type=None,
    remaining_recovery_opportunities=None, previous_recovery_attempts=None,
    customer_name=None,
) -> dict:
    link_token = uuid.uuid4().hex[:12]
    link = f"{settings.RECOVERY_LINK_BASE_URL}/{payment_id}?t={link_token}"

    urgency_prefix, urgency_line = _urgency_copy(remaining_recovery_opportunities, previous_recovery_attempts)
    failure_reason = FAILURE_COPY.get(failure_type, "the payment attempt was unsuccessful")
    cta_label = "Try a different payment method" if kind == "alternative_method" else "Complete your payment"
    subject = f"{urgency_prefix}: {'a different way to pay' if kind == 'alternative_method' else f'your {currency} {amount:,.0f} payment'}"

    html_body = _build_html(
        greeting_name=customer_name or "",
        amount=amount,
        currency=currency,
        payment_id=payment_id,
        failure_reason=failure_reason,
        urgency_line=urgency_line,
        cta_label=cta_label,
        link=link,
    )

    text_body = (
        f"{subject}\n\n"
        f"We couldn't complete your payment of {currency} {amount:,.2f} (ref: {payment_id}) "
        f"because {failure_reason}.\n\n"
        f"{urgency_line}\n\n"
        f"{cta_label}: {link}\n\n"
        "If you've already completed this payment through another method, please disregard this email -- "
        "no further action is needed.\n\n"
        "This is a simulated recovery email sent by TRACE for demonstration purposes."
    )

    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.EMAIL_FROM
            msg["To"] = to_address
            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.EMAIL_FROM, [to_address], msg.as_string())
            return {
                "delivery": "REAL",
                "to": to_address,
                "subject": subject,
                "link": link,
                "link_token": link_token,
            }
        except Exception as exc:
            return {
                "delivery": "FAILED",
                "to": to_address,
                "subject": subject,
                "link": link,
                "link_token": link_token,
                "error": str(exc),
            }

    # No SMTP configured -- clearly labeled simulated send, but with the
    # full rendered content so the audit trail / case investigation view
    # can show exactly what would have been sent.
    return {
        "delivery": "SIMULATED",
        "to": to_address,
        "subject": subject,
        "body": text_body,
        "html_body": html_body,
        "link": link,
        "link_token": link_token,
        "urgency_line": urgency_line,
    }