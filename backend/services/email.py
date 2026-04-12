"""Email sending via SMTP (Gmail)."""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def _smtp_config():
    return {
        "host": os.getenv("SNAP_SMTP_HOST", "smtp.gmail.com"),
        "port": int(os.getenv("SNAP_SMTP_PORT", "587")),
        "user": os.getenv("SNAP_SMTP_USER", ""),
        "password": os.getenv("SNAP_SMTP_PASSWORD", ""),
    }


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password reset email."""
    cfg = _smtp_config()
    if not cfg["user"] or not cfg["password"]:
        raise RuntimeError("SMTP credentials not configured (SNAP_SMTP_USER / SNAP_SMTP_PASSWORD)")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Receipts – Password Reset"
    msg["From"] = cfg["user"]
    msg["To"] = to_email

    text_body = f"""\
You requested a password reset for your Receipts account.

Click the link below to set a new password (valid for 1 hour):

{reset_url}

If you did not request this, you can safely ignore this email.
"""

    html_body = f"""\
<html><body>
<p>You requested a password reset for your <strong>Receipts</strong> account.</p>
<p><a href="{reset_url}">Reset my password</a></p>
<p>This link is valid for 1 hour. If you did not request this, you can safely ignore this email.</p>
</body></html>
"""

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["user"], to_email, msg.as_string())
