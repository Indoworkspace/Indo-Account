from __future__ import annotations

import logging
from typing import Any


logger = logging.getLogger(__name__)


class EmailConfigurationError(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


class SesEmailSender:
    def __init__(self, client: Any, *, from_email: str):
        self.client = client
        self.from_email = from_email.strip()

    def _send_otp(
        self,
        destination: str,
        code: str,
        *,
        subject: str,
        heading: str,
        introduction: str,
        failure_message: str,
    ) -> None:
        if not self.from_email:
            raise EmailConfigurationError("Email verification is not configured yet.")

        text = (
            f"{introduction} Your verification code is "
            f"{code}. It expires in 10 minutes. "
            "If you did not request this code, you can ignore this email."
        )
        html = f"""<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
    <div style="max-width:520px;margin:32px auto;padding:28px;background:#fff;border-radius:16px;border:1px solid #dfe6f0">
      <div style="font-size:14px;font-weight:700;color:#2457d6">Indo Account</div>
      <h1 style="font-size:22px;margin:18px 0 8px">{heading}</h1>
      <p style="line-height:1.55;color:#536079">{introduction}</p>
      <div style="margin:24px 0;padding:18px;text-align:center;border-radius:12px;background:#eef4ff;font-size:32px;font-weight:800;letter-spacing:8px;color:#1749bd">{code}</div>
      <p style="line-height:1.55;color:#536079">This code expires in 10 minutes. Never share it with anyone.</p>
      <p style="margin-top:24px;font-size:12px;color:#7a879a">If you did not request this code, ignore this email.</p>
    </div>
  </body>
</html>"""

        try:
            self.client.send_email(
                FromEmailAddress=f"Indo Account <{self.from_email}>",
                Destination={"ToAddresses": [destination]},
                Content={
                    "Simple": {
                        "Subject": {"Data": subject, "Charset": "UTF-8"},
                        "Body": {
                            "Text": {"Data": text, "Charset": "UTF-8"},
                            "Html": {"Data": html, "Charset": "UTF-8"},
                        },
                    }
                },
            )
        except Exception as error:
            logger.exception("SES failed to deliver an OTP email")
            raise EmailDeliveryError(failure_message) from error

    def send_signup_otp(self, destination: str, code: str) -> None:
        self._send_otp(
            destination,
            code,
            subject="Your Indo Account verification code",
            heading="Verify your recovery email",
            introduction="Use this code to continue creating your Indo Account:",
            failure_message="Verification email could not be sent. Try again shortly.",
        )

    def send_password_reset_otp(self, destination: str, code: str) -> None:
        self._send_otp(
            destination,
            code,
            subject="Reset your Indo Account password",
            heading="Reset your password",
            introduction="Use this code to reset your Indo Account password:",
            failure_message="Password reset email could not be sent. Try again shortly.",
        )

    def send_recovery_email_otp(self, destination: str, code: str) -> None:
        self._send_otp(
            destination,
            code,
            subject="Verify your new Indo Account recovery email",
            heading="Verify your new recovery email",
            introduction="Use this code to confirm your new Indo Account recovery email:",
            failure_message="Recovery email verification could not be sent. Try again shortly.",
        )
