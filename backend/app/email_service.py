"""
Email delivery for recovery links / alternative-method suggestions.

If SMTP credentials are configured, this sends a real email (spec section
21: "Real -- email sending"). If not configured, it logs a clearly-labeled
SIMULATED send so the rest of the pipeline (audit trail, dashboard) still
works end-to-end without requiring the demo operator to set up SMTP first.
"""
import smtplib
import uuid
from email.mime.text import MIMEText

from app.config import settings


def send_recovery_email(to_address: str, payment_id: str, amount: float,
                         kind: str = "recovery_link") -> dict:
    link_token = uuid.uuid4().hex[:12]
    link = f"{settings.RECOVERY_LINK_BASE_URL}/{payment_id}?t={link_token}"

    if kind == "alternative_method":
        subject = "A different way to complete your payment"
        body = (
            f"Hi,\n\nWe noticed your payment of ₹{amount:.2f} (ref: {payment_id}) didn't go through.\n"
            f"You can try an alternative payment method here:\n{link}\n\nThanks."
        )
    else:
        subject = "Complete your payment"
        body = (
            f"Hi,\n\nYour payment of ₹{amount:.2f} (ref: {payment_id}) could not be completed.\n"
            f"You can retry securely here:\n{link}\n\nThanks."
        )

    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = settings.EMAIL_FROM
            msg["To"] = to_address
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

    # No SMTP configured -- clearly labeled simulated send.
    return {
        "delivery": "SIMULATED",
        "to": to_address,
        "subject": subject,
        "body": body,
        "link": link,
        "link_token": link_token,
    }
