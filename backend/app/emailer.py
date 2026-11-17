from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any


logger = logging.getLogger(__name__)


class EmailConfigurationError(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


class EyemailSender:
    """Deliver mail through the Eyemail backend.

    This is now the only transport: the service sends verification codes, account alerts and
    support mail by POSTing to Eyemail's internal API, which stores internal mail in Firestore
    and relays external mail itself. AWS SES is no longer used anywhere.

    Every call carries the shared internal key, and every failure surfaces as
    EmailDeliveryError so callers keep their existing behaviour.
    """

    def __init__(self, base_url: str, *, secret: str, sender_name: str = "Indo Security Team", timeout: float = 6.0):
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.sender_name = sender_name
        self.timeout = timeout

    def _post(
        self,
        path: str,
        payload: dict[str, Any] | None,
        failure_message: str,
        log_message: str,
        *,
        method: str = "POST",
    ) -> dict[str, Any]:
        if not self.base_url:
            raise EmailConfigurationError("Email delivery is not configured yet.")
        if not self.secret:
            raise EmailConfigurationError("Email delivery is not configured yet.")
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            headers={"Content-Type": "application/json", "X-API-Key": self.secret},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read().decode("utf-8", "replace")
                if response.status >= 300:
                    raise EmailDeliveryError(failure_message)
                try:
                    return json.loads(body) if body else {}
                except ValueError:
                    return {}
        except EmailDeliveryError:
            raise
        except urllib.error.HTTPError as error:
            if error.code == 404 and method == "DELETE":
                # Nothing to remove: the mailbox is already gone, which is the outcome we want.
                return {"status": "missing"}
            logger.exception(log_message)
            raise EmailDeliveryError(failure_message) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            logger.exception(log_message)
            raise EmailDeliveryError(failure_message) from error

    def _send(self, destination: str, *, subject: str, text: str, failure_message: str, log_message: str) -> None:
        if not destination:
            raise EmailConfigurationError("Email delivery is not configured yet.")
        self._post(
            "/api/internal/send-mail",
            {"to": destination, "subject": subject, "body": text, "sender_name": self.sender_name},
            failure_message,
            log_message,
        )

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
        text = (
            f"{heading}\n\n{introduction} Your verification code is {code}. "
            "It expires in 10 minutes. Never share it with anyone. "
            "If you did not request this code, you can ignore this email."
        )
        self._send(destination, subject=subject, text=text, failure_message=failure_message, log_message="Eyemail failed to deliver an OTP email")

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

    def send_security_action_otp(self, destination: str, code: str, action_label: str) -> None:
        self._send_otp(
            destination,
            code,
            subject="Confirm your Indo Account security change",
            heading="Confirm this security change",
            introduction=f"Use this code to confirm {action_label}:",
            failure_message="Security verification email could not be sent. Try again shortly.",
        )

    def send_account_alert(self, destination: str, *, subject: str, heading: str, message: str) -> None:
        text = f"{heading}\n\n{message}\n\nIf this was not you, reset your password and review your devices immediately."
        self._send(destination, subject=subject, text=text, failure_message="Account alert email could not be sent.", log_message="Eyemail failed to deliver an account alert")

    def send_support_request(
        self,
        destination: str,
        *,
        reference: str,
        user_name: str,
        user_email: str,
        user_id: str,
        category: str,
        message: str,
    ) -> None:
        body = (
            f"Reference: {reference}\nCategory: {category}\nUser: {user_name}\n"
            f"User ID: {user_id}\nRecovery email: {user_email}\n\nMessage:\n{message}"
        )
        self._send(
            destination,
            subject=f"[{reference}] Indo Account support request",
            text=body,
            failure_message="Support request could not be sent. Try again shortly.",
            log_message="Eyemail failed to deliver a support request",
        )

    def send_support_confirmation(self, destination: str, *, reference: str) -> None:
        text = f"We received your Indo Account support request. Your reference is {reference}. Keep this number if you need to follow up."
        self._send(
            destination,
            subject=f"Support request received ({reference})",
            text=text,
            failure_message="Support confirmation could not be sent.",
            log_message="Eyemail failed to deliver a support confirmation",
        )

    def register_mailbox(self, *, user_id: str, username: str, name: str, recovery_email: str = "") -> dict[str, Any]:
        """Ask Eyemail to create the mailbox for a new account.

        Eyemail keys the mailbox by our user id and takes the local part separately, so the
        address is never re-parsed on their side.
        """
        return self._post(
            "/api/internal/register-mailbox",
            {"uid": user_id, "username": username, "name": name, "recovery_email": recovery_email},
            "Mailbox could not be created right now.",
            "Eyemail failed to register a mailbox",
        )

    def delete_mailbox(self, user_id: str) -> dict[str, Any]:
        """Remove the mailbox when the account is deleted. A missing mailbox is not an error."""
        return self._post(
            f"/api/internal/register-mailbox/{user_id}",
            None,
            "Mailbox could not be removed right now.",
            "Eyemail failed to delete a mailbox",
            method="DELETE",
        )

    def rename_mailbox(self, user_id: str, name: str) -> dict[str, Any]:
        """Change the display name only. The address and the mail never move."""
        return self._post(
            f"/api/internal/register-mailbox/{user_id}",
            {"name": name},
            "Mailbox name could not be updated right now.",
            "Eyemail failed to rename a mailbox",
            method="PATCH",
        )
