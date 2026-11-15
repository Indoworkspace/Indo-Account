from __future__ import annotations

import logging
import hmac
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .security import hash_password, new_session_token, new_verification_token, token_digest, verify_password


logger = logging.getLogger(__name__)
DUMMY_PASSWORD_HASH = "pbkdf2_sha256$600000$SW5kb0FjY291bnREdW1teQ==$VTRGin763QpbCrYX73_o1pn4omMz-J4ZOzlXfzOAvSE="


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class ConflictError(Exception):
    pass


class AuthenticationError(Exception):
    pass


class RequestRateLimitError(Exception):
    def __init__(self, retry_after: int, message: str = "Too many requests. Try again later."):
        super().__init__(message)
        self.retry_after = max(1, retry_after)


class AuthenticationRateLimitError(RequestRateLimitError, AuthenticationError):
    def __init__(self, retry_after: int, *, user_id: str | None = None, newly_blocked: bool = False):
        super().__init__(retry_after, "Too many sign-in attempts. Try again later.")
        self.user_id = user_id
        self.newly_blocked = newly_blocked


class NotFoundError(Exception):
    pass


class OtpError(Exception):
    pass


class OtpRateLimitError(OtpError):
    def __init__(self, retry_after: int):
        super().__init__("Too many verification code requests. Try again later.")
        self.retry_after = max(1, retry_after)


class DynamoAccountRepository:
    """Single-table DynamoDB access for Indo Account.

    The injected table only needs the boto3 Table interface, which keeps the
    data layer testable without AWS credentials.
    """

    LOOKUP_FIELDS = {
        "eyemail": "eyemail_id",
        "email": "secondary_email",
        "phone": "phone",
    }
    APP_DEFAULTS = {
        "SANKALPA": {"name": "Sankalp", "status": "Active", "connected": True, "plan": "Not connected", "quota": "No usage yet", "renewal": "—", "last_used": "Not yet used", "data": {"history": [], "saved": [], "memory": [], "preferences": {}}},
        "EYESEARCH": {"name": "Eyesearch Search Engine", "status": "Active", "connected": True, "plan": "Not connected", "quota": "No usage yet", "renewal": "—", "last_used": "Not yet used", "data": {"history": [], "saved": [], "preferences": {}}},
        "EYEBROWSE": {"name": "Eyebrowse Browser", "status": "Active", "connected": True, "plan": "Not connected", "quota": "No usage yet", "renewal": "—", "last_used": "Not yet used", "data": {"history": [], "saved": [], "preferences": {}}},
    }

    def __init__(
        self,
        table: Any,
        *,
        session_days: int = 30,
        session_max_active: int = 10,
        session_activity_update_seconds: int = 300,
        otp_max_attempts: int = 5,
        otp_verification_seconds: int = 900,
    ):
        self.table = table
        self.session_seconds = session_days * 86_400
        self.session_max_active = max(1, session_max_active)
        self.session_activity_update_seconds = max(60, session_activity_update_seconds)
        self.otp_max_attempts = otp_max_attempts
        self.otp_verification_seconds = otp_verification_seconds

    @staticmethod
    def _profile_key(user_id: str) -> dict[str, str]:
        return {"PK": f"USER#{user_id}", "SK": "PROFILE"}

    @staticmethod
    def _auth_key(user_id: str) -> dict[str, str]:
        return {"PK": f"USER#{user_id}", "SK": "AUTH#PASSWORD"}

    @staticmethod
    def _lookup_key(kind: str, value: str) -> dict[str, str]:
        return {"PK": f"LOOKUP#{kind.upper()}#{value}", "SK": "USER"}

    @staticmethod
    def _signup_otp_key(email: str) -> dict[str, str]:
        return {"PK": f"OTP#SIGNUP#{token_digest(email.strip().lower())}", "SK": "CHALLENGE"}

    @staticmethod
    def _signup_verification_key(token: str) -> dict[str, str]:
        return {"PK": f"VERIFY#SIGNUP#{token_digest(token)}", "SK": "EMAIL"}

    @staticmethod
    def _password_reset_otp_key(user_id: str) -> dict[str, str]:
        return {"PK": f"OTP#PASSWORD_RESET#{token_digest(user_id)}", "SK": "CHALLENGE"}

    @staticmethod
    def _password_reset_verification_key(token: str) -> dict[str, str]:
        return {"PK": f"VERIFY#PASSWORD_RESET#{token_digest(token)}", "SK": "USER"}

    @staticmethod
    def _recovery_email_otp_key(user_id: str) -> dict[str, str]:
        return {"PK": f"OTP#RECOVERY_EMAIL#{token_digest(user_id)}", "SK": "CHALLENGE"}

    @staticmethod
    def _security_otp_key(user_id: str, action: str) -> dict[str, str]:
        return {
            "PK": f"OTP#SECURITY#{token_digest(f'{user_id}:{action}')}",
            "SK": "CHALLENGE",
        }

    @staticmethod
    def _security_verification_key(token: str) -> dict[str, str]:
        return {"PK": f"VERIFY#SECURITY#{token_digest(token)}", "SK": "ACTION"}

    @staticmethod
    def _otp_rate_key(scope: str, window_seconds: int, now: int) -> dict[str, str]:
        bucket = now // window_seconds
        return {
            "PK": f"RATE#OTP#{token_digest(scope)}",
            "SK": f"WINDOW#{window_seconds}#{bucket}",
        }

    def enforce_otp_request_limits(
        self,
        flow: str,
        subject: str,
        client_ip: str,
        *,
        now: int,
        short_window_seconds: int,
        target_short_limit: int,
        target_daily_limit: int,
        ip_short_limit: int,
        ip_daily_limit: int,
    ) -> None:
        day_seconds = 86_400
        short_window_seconds = max(60, short_window_seconds)
        limits = (
            (f"{flow}:target:{subject}", short_window_seconds, target_short_limit),
            (f"{flow}:target:{subject}", day_seconds, target_daily_limit),
            (f"ip:{client_ip}", short_window_seconds, ip_short_limit),
            (f"ip:{client_ip}", day_seconds, ip_daily_limit),
        )
        actions = []
        for scope, window_seconds, limit in limits:
            window_end = ((now // window_seconds) + 1) * window_seconds
            actions.append(
                {
                    "Update": {
                        "TableName": self.table.name,
                        "Key": self._otp_rate_key(scope, window_seconds, now),
                        "UpdateExpression": (
                            "SET entity_type = :entity, expires_at = :expires, #ttl = :ttl "
                            "ADD request_count :one"
                        ),
                        "ConditionExpression": (
                            "attribute_not_exists(request_count) OR request_count < :request_limit"
                        ),
                        "ExpressionAttributeValues": {
                            ":entity": "OTP_REQUEST_RATE_LIMIT",
                            ":expires": window_end,
                            ":ttl": window_end + day_seconds,
                            ":one": 1,
                            ":request_limit": max(1, limit),
                        },
                        "ExpressionAttributeNames": {"#ttl": "ttl"},
                    }
                }
            )

        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            reasons = (getattr(error, "response", {}) or {}).get("CancellationReasons") or []
            blocked_windows = [
                window_seconds
                for reason, (_scope, window_seconds, _limit) in zip(reasons, limits)
                if reason.get("Code") == "ConditionalCheckFailed"
            ]
            if not blocked_windows:
                blocked_windows = [short_window_seconds]
            retry_after = max(
                ((now // window_seconds) + 1) * window_seconds - now
                for window_seconds in blocked_windows
            )
            raise OtpRateLimitError(retry_after) from error

    @staticmethod
    def _request_rate_key(category: str, scope: str, window_seconds: int, now: int) -> dict[str, str]:
        bucket = now // window_seconds
        return {
            "PK": f"RATE#{category.upper()}#{token_digest(scope)}",
            "SK": f"WINDOW#{window_seconds}#{bucket}",
        }

    def enforce_public_request_limits(
        self,
        feature: str,
        subject: str,
        client_ip: str,
        *,
        now: int,
        window_seconds: int,
        subject_limit: int,
        ip_limit: int,
    ) -> None:
        window_seconds = max(60, window_seconds)
        window_end = ((now // window_seconds) + 1) * window_seconds
        limits = (
            (f"{feature}:target:{subject}", max(1, subject_limit)),
            (f"{feature}:ip:{client_ip}", max(1, ip_limit)),
        )
        actions = [
            {
                "Update": {
                    "TableName": self.table.name,
                    "Key": self._request_rate_key("PUBLIC", scope, window_seconds, now),
                    "UpdateExpression": (
                        "SET entity_type = :entity, expires_at = :expires, #ttl = :ttl "
                        "ADD request_count :one"
                    ),
                    "ConditionExpression": (
                        "attribute_not_exists(request_count) OR request_count < :request_limit"
                    ),
                    "ExpressionAttributeValues": {
                        ":entity": "PUBLIC_REQUEST_RATE_LIMIT",
                        ":expires": window_end,
                        ":ttl": window_end + 86_400,
                        ":one": 1,
                        ":request_limit": limit,
                    },
                    "ExpressionAttributeNames": {"#ttl": "ttl"},
                }
            }
            for scope, limit in limits
        ]
        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            retry_after = window_end - now
            raise RequestRateLimitError(retry_after) from error

    @staticmethod
    def _public(item: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in item.items() if key not in {"PK", "SK", "password_hash"}}

    def record_security_event(self, user_id: str, event_type: str, title: str, detail: str) -> None:
        created_at = utc_now()
        event_key = {
            "PK": f"USER#{user_id}",
            "SK": f"EVENT#{int(time.time() * 1000)}#{uuid4().hex[:10]}",
        }
        self.table.put_item(
            Item={
                **event_key,
                "entity_type": "SECURITY_EVENT",
                "id": event_key["SK"].removeprefix("EVENT#"),
                "type": event_type,
                "title": title[:120],
                "detail": detail[:500],
                "created_at": created_at,
            }
        )

    def table_status(self) -> dict[str, Any]:
        description = self.table.meta.client.describe_table(TableName=self.table.name)["Table"]
        return {
            "table": description["TableName"],
            "status": description["TableStatus"],
            "region": self.table.meta.client.meta.region_name,
            "billing_mode": description.get("BillingModeSummary", {}).get("BillingMode", "PROVISIONED"),
            "read_capacity": description.get("ProvisionedThroughput", {}).get("ReadCapacityUnits"),
            "write_capacity": description.get("ProvisionedThroughput", {}).get("WriteCapacityUnits"),
        }

    def email_registered(self, email: str) -> bool:
        normalized = email.strip().lower()
        return bool(
            self.table.get_item(
                Key=self._lookup_key("EMAIL", normalized),
                ConsistentRead=True,
            ).get("Item")
        )

    def indo_id_available(self, handle: str) -> bool:
        normalized = handle.strip().lower().removesuffix("@eyemail.in")
        eyemail = f"{normalized}@eyemail.in"
        return not bool(
            self.table.get_item(
                Key=self._lookup_key("EYEMAIL", eyemail),
                ConsistentRead=True,
            ).get("Item")
        )

    def recovery_email_target(self, user_id: str, email: str) -> str:
        normalized = email.strip().lower()
        profile = self.table.get_item(
            Key=self._profile_key(user_id),
            ConsistentRead=True,
        ).get("Item")
        if not profile:
            raise NotFoundError("Account was not found.")
        if normalized == str(profile.get("secondary_email", "")).strip().lower():
            raise ConflictError("This recovery email is already verified on your account.")
        if self.email_registered(normalized):
            raise ConflictError("This recovery email is already registered.")
        return normalized

    def store_recovery_email_otp(
        self,
        user_id: str,
        email: str,
        code_hash: str,
        *,
        expires_at: int,
        resend_after: int,
    ) -> None:
        now = int(time.time())
        key = self._recovery_email_otp_key(user_id)
        try:
            self.table.put_item(
                Item={
                    **key,
                    "entity_type": "RECOVERY_EMAIL_OTP",
                    "user_id": user_id,
                    "email": email,
                    "code_hash": code_hash,
                    "attempts": 0,
                    "expires_at": expires_at,
                    "resend_after": resend_after,
                    "ttl": expires_at,
                    "created_at": utc_now(),
                },
                ConditionExpression="attribute_not_exists(PK) OR #resend <= :now",
                ExpressionAttributeNames={"#resend": "resend_after"},
                ExpressionAttributeValues={":now": now},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
            existing = self.table.get_item(Key=key, ConsistentRead=True).get("Item", {})
            retry_after = int(existing.get("resend_after", now + 1)) - now
            raise OtpRateLimitError(retry_after) from error

    def discard_recovery_email_otp(self, user_id: str, code_hash: str) -> None:
        try:
            self.table.delete_item(
                Key=self._recovery_email_otp_key(user_id),
                ConditionExpression="code_hash = :code_hash",
                ExpressionAttributeValues={":code_hash": code_hash},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            pass

    def verify_recovery_email_otp(self, user_id: str, email: str, code_hash: str) -> dict[str, Any]:
        normalized = email.strip().lower()
        challenge_key = self._recovery_email_otp_key(user_id)
        challenge = self.table.get_item(Key=challenge_key, ConsistentRead=True).get("Item")
        now = int(time.time())
        if (
            not challenge
            or challenge.get("user_id") != user_id
            or challenge.get("email") != normalized
            or int(challenge.get("expires_at", 0)) <= now
        ):
            if challenge:
                self.table.delete_item(Key=challenge_key)
            raise OtpError("This verification code has expired. Request a new code.")

        attempts = int(challenge.get("attempts", 0))
        if attempts >= self.otp_max_attempts:
            self.table.delete_item(Key=challenge_key)
            raise OtpError("Too many incorrect attempts. Request a new code.")
        if not hmac.compare_digest(str(challenge.get("code_hash", "")), code_hash):
            attempts += 1
            if attempts >= self.otp_max_attempts:
                self.table.delete_item(Key=challenge_key)
                raise OtpError("Too many incorrect attempts. Request a new code.")
            self.table.update_item(
                Key=challenge_key,
                UpdateExpression="SET attempts = :attempts",
                ExpressionAttributeValues={":attempts": attempts},
                ConditionExpression="attribute_exists(PK)",
            )
            remaining = self.otp_max_attempts - attempts
            raise OtpError(f"The verification code is incorrect. {remaining} attempts remaining.")

        profile_key = self._profile_key(user_id)
        profile = self.table.get_item(Key=profile_key, ConsistentRead=True).get("Item")
        if not profile:
            raise NotFoundError("Account was not found.")
        old_email = str(profile.get("secondary_email", "")).strip().lower()
        if normalized == old_email:
            self.table.delete_item(Key=challenge_key)
            raise ConflictError("This recovery email is already verified on your account.")
        if self.email_registered(normalized):
            raise ConflictError("This recovery email is already registered.")

        old_lookup = self.table.get_item(
            Key=self._lookup_key("EMAIL", old_email),
            ConsistentRead=True,
        ).get("Item") if old_email else None
        if old_lookup and old_lookup.get("user_id") != user_id:
            raise OtpError("Recovery email could not be updated. Contact support.")

        updated_at = utc_now()
        event_key = {
            "PK": f"USER#{user_id}",
            "SK": f"EVENT#{int(time.time() * 1000)}#{uuid4().hex[:10]}",
        }
        actions: list[dict[str, Any]] = [
            {
                "Put": {
                    "TableName": self.table.name,
                    "Item": {
                        **self._lookup_key("EMAIL", normalized),
                        "entity_type": "IDENTITY_LOOKUP",
                        "user_id": user_id,
                        "created_at": updated_at,
                    },
                    "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                }
            },
            {
                "Update": {
                    "TableName": self.table.name,
                    "Key": profile_key,
                    "UpdateExpression": "SET secondary_email = :email, secondary_email_verified = :verified, updated_at = :updated",
                    "ConditionExpression": "secondary_email = :old_email",
                    "ExpressionAttributeValues": {
                        ":email": normalized,
                        ":verified": True,
                        ":updated": updated_at,
                        ":old_email": old_email,
                    },
                }
            },
            {
                "Delete": {
                    "TableName": self.table.name,
                    "Key": challenge_key,
                    "ConditionExpression": "code_hash = :code_hash AND #email = :email AND expires_at > :now",
                    "ExpressionAttributeNames": {"#email": "email"},
                    "ExpressionAttributeValues": {
                        ":code_hash": code_hash,
                        ":email": normalized,
                        ":now": now,
                    },
                }
            },
            {
                "Put": {
                    "TableName": self.table.name,
                    "Item": {
                        **event_key,
                        "entity_type": "SECURITY_EVENT",
                        "id": event_key["SK"].removeprefix("EVENT#"),
                        "type": "recovery",
                        "title": "Recovery email updated",
                        "detail": "Your recovery email was verified and updated.",
                        "created_at": updated_at,
                    },
                    "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                }
            },
        ]
        if old_lookup:
            actions.append(
                {
                    "Delete": {
                        "TableName": self.table.name,
                        "Key": self._lookup_key("EMAIL", old_email),
                        "ConditionExpression": "user_id = :user_id",
                        "ExpressionAttributeValues": {":user_id": user_id},
                    }
                }
            )
        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            reasons = (getattr(error, "response", {}) or {}).get("CancellationReasons") or []
            if reasons and reasons[0].get("Code") == "ConditionalCheckFailed":
                raise ConflictError("This recovery email is already registered.") from error
            raise OtpError("Recovery email could not be updated. Request a new code.") from error
        return self.get_account_state(user_id)

    def security_otp_target(self, user_id: str) -> str:
        profile = self.table.get_item(
            Key=self._profile_key(user_id),
            ConsistentRead=True,
        ).get("Item")
        if not profile:
            raise NotFoundError("Account was not found.")
        email = str(profile.get("secondary_email", "")).strip().lower()
        if not email or not profile.get("secondary_email_verified"):
            raise OtpError("Verify a recovery email before using two-step protection.")
        return email

    def store_security_otp(
        self,
        user_id: str,
        action: str,
        email: str,
        code_hash: str,
        *,
        expires_at: int,
        resend_after: int,
    ) -> None:
        now = int(time.time())
        key = self._security_otp_key(user_id, action)
        try:
            self.table.put_item(
                Item={
                    **key,
                    "entity_type": "SECURITY_ACTION_OTP",
                    "user_id": user_id,
                    "action": action,
                    "email": email,
                    "code_hash": code_hash,
                    "attempts": 0,
                    "expires_at": expires_at,
                    "resend_after": resend_after,
                    "ttl": expires_at,
                    "created_at": utc_now(),
                },
                ConditionExpression="attribute_not_exists(PK) OR #resend <= :now",
                ExpressionAttributeNames={"#resend": "resend_after"},
                ExpressionAttributeValues={":now": now},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
            existing = self.table.get_item(Key=key, ConsistentRead=True).get("Item", {})
            retry_after = int(existing.get("resend_after", now + 1)) - now
            raise OtpRateLimitError(retry_after) from error

    def discard_security_otp(self, user_id: str, action: str, code_hash: str) -> None:
        try:
            self.table.delete_item(
                Key=self._security_otp_key(user_id, action),
                ConditionExpression="code_hash = :code_hash",
                ExpressionAttributeValues={":code_hash": code_hash},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            pass

    def verify_security_otp(self, user_id: str, action: str, code_hash: str) -> str:
        challenge_key = self._security_otp_key(user_id, action)
        challenge = self.table.get_item(Key=challenge_key, ConsistentRead=True).get("Item")
        now = int(time.time())
        if (
            not challenge
            or challenge.get("user_id") != user_id
            or challenge.get("action") != action
            or int(challenge.get("expires_at", 0)) <= now
        ):
            if challenge:
                self.table.delete_item(Key=challenge_key)
            raise OtpError("This verification code has expired. Request a new code.")

        attempts = int(challenge.get("attempts", 0))
        if attempts >= self.otp_max_attempts:
            self.table.delete_item(Key=challenge_key)
            raise OtpError("Too many incorrect attempts. Request a new code.")
        if not hmac.compare_digest(str(challenge.get("code_hash", "")), code_hash):
            attempts += 1
            if attempts >= self.otp_max_attempts:
                self.table.delete_item(Key=challenge_key)
                raise OtpError("Too many incorrect attempts. Request a new code.")
            self.table.update_item(
                Key=challenge_key,
                UpdateExpression="SET attempts = :attempts",
                ExpressionAttributeValues={":attempts": attempts},
                ConditionExpression="attribute_exists(PK)",
            )
            remaining = self.otp_max_attempts - attempts
            raise OtpError(f"The verification code is incorrect. {remaining} attempts remaining.")

        verification_token = new_verification_token()
        verification_key = self._security_verification_key(verification_token)
        verification_expires = now + self.otp_verification_seconds
        client = self.table.meta.client
        try:
            client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table.name,
                            "Item": {
                                **verification_key,
                                "entity_type": "SECURITY_ACTION_VERIFICATION",
                                "user_id": user_id,
                                "action": action,
                                "expires_at": verification_expires,
                                "ttl": verification_expires,
                                "created_at": utc_now(),
                            },
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                    {
                        "Delete": {
                            "TableName": self.table.name,
                            "Key": challenge_key,
                            "ConditionExpression": "code_hash = :code_hash",
                            "ExpressionAttributeValues": {":code_hash": code_hash},
                        }
                    },
                ]
            )
        except client.exceptions.TransactionCanceledException as error:
            raise OtpError("Security verification could not be completed. Request a new code.") from error
        return verification_token

    def validated_security_verification(self, user_id: str, action: str, token: str) -> dict[str, str]:
        if not token:
            raise OtpError("Verify this security change using the code sent to your recovery email.")
        key = self._security_verification_key(token)
        item = self.table.get_item(Key=key, ConsistentRead=True).get("Item")
        if (
            not item
            or item.get("user_id") != user_id
            or item.get("action") != action
            or int(item.get("expires_at", 0)) <= int(time.time())
        ):
            if item and int(item.get("expires_at", 0)) <= int(time.time()):
                self.table.delete_item(Key=key)
            raise OtpError("Security verification expired. Request a new code.")
        return key

    def consume_security_verification(self, user_id: str, action: str, token: str) -> None:
        key = self.validated_security_verification(user_id, action, token)
        try:
            self.table.delete_item(
                Key=key,
                ConditionExpression="user_id = :user_id AND #action = :action AND expires_at > :now",
                ExpressionAttributeNames={"#action": "action"},
                ExpressionAttributeValues={
                    ":user_id": user_id,
                    ":action": action,
                    ":now": int(time.time()),
                },
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
            raise OtpError("Security verification expired. Request a new code.") from error

    def store_signup_otp(
        self,
        email: str,
        code_hash: str,
        *,
        expires_at: int,
        resend_after: int,
    ) -> None:
        normalized = email.strip().lower()
        now = int(time.time())
        key = self._signup_otp_key(normalized)
        try:
            self.table.put_item(
                Item={
                    **key,
                    "entity_type": "SIGNUP_EMAIL_OTP",
                    "email": normalized,
                    "code_hash": code_hash,
                    "attempts": 0,
                    "expires_at": expires_at,
                    "resend_after": resend_after,
                    "ttl": expires_at,
                    "created_at": utc_now(),
                },
                ConditionExpression="attribute_not_exists(PK) OR #resend <= :now",
                ExpressionAttributeNames={"#resend": "resend_after"},
                ExpressionAttributeValues={":now": now},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
            existing = self.table.get_item(Key=key, ConsistentRead=True).get("Item", {})
            retry_after = int(existing.get("resend_after", now + 1)) - now
            raise OtpRateLimitError(retry_after) from error

    def discard_signup_otp(self, email: str, code_hash: str) -> None:
        try:
            self.table.delete_item(
                Key=self._signup_otp_key(email),
                ConditionExpression="code_hash = :code_hash",
                ExpressionAttributeValues={":code_hash": code_hash},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            pass

    def verify_signup_otp(self, email: str, code_hash: str) -> str:
        normalized = email.strip().lower()
        key = self._signup_otp_key(normalized)
        item = self.table.get_item(Key=key, ConsistentRead=True).get("Item")
        now = int(time.time())
        if not item or item.get("email") != normalized or int(item.get("expires_at", 0)) <= now:
            if item:
                self.table.delete_item(Key=key)
            raise OtpError("This verification code has expired. Request a new code.")

        attempts = int(item.get("attempts", 0))
        if attempts >= self.otp_max_attempts:
            self.table.delete_item(Key=key)
            raise OtpError("Too many incorrect attempts. Request a new code.")

        if not hmac.compare_digest(str(item.get("code_hash", "")), code_hash):
            attempts += 1
            if attempts >= self.otp_max_attempts:
                self.table.delete_item(Key=key)
                raise OtpError("Too many incorrect attempts. Request a new code.")
            self.table.update_item(
                Key=key,
                UpdateExpression="SET attempts = :attempts",
                ExpressionAttributeValues={":attempts": attempts},
                ConditionExpression="attribute_exists(PK)",
            )
            remaining = self.otp_max_attempts - attempts
            raise OtpError(f"The verification code is incorrect. {remaining} attempts remaining.")

        verification_token = new_verification_token()
        verification_key = self._signup_verification_key(verification_token)
        verification_expires = now + self.otp_verification_seconds
        client = self.table.meta.client
        try:
            client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table.name,
                            "Item": {
                                **verification_key,
                                "entity_type": "SIGNUP_EMAIL_VERIFICATION",
                                "email": normalized,
                                "expires_at": verification_expires,
                                "ttl": verification_expires,
                                "created_at": utc_now(),
                            },
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                    {
                        "Delete": {
                            "TableName": self.table.name,
                            "Key": key,
                            "ConditionExpression": "code_hash = :code_hash",
                            "ExpressionAttributeValues": {":code_hash": code_hash},
                        }
                    },
                ]
            )
        except client.exceptions.TransactionCanceledException as error:
            raise OtpError("Verification could not be completed. Request a new code.") from error
        return verification_token

    def _validated_signup_verification(self, email: str, token: str) -> dict[str, str]:
        normalized = email.strip().lower()
        key = self._signup_verification_key(token)
        item = self.table.get_item(Key=key, ConsistentRead=True).get("Item")
        if (
            not item
            or item.get("email") != normalized
            or int(item.get("expires_at", 0)) <= int(time.time())
        ):
            raise OtpError("Verify your recovery email again before creating the account.")
        return key

    def password_reset_target(self, identifier: str) -> tuple[str, str] | None:
        user_id = self.find_user_id(identifier)
        if not user_id:
            return None
        profile = self.table.get_item(
            Key=self._profile_key(user_id),
            ConsistentRead=True,
        ).get("Item")
        if not profile or not profile.get("secondary_email_verified"):
            return None
        email = str(profile.get("secondary_email", "")).strip().lower()
        if not email:
            return None
        return user_id, email

    def store_password_reset_otp(
        self,
        user_id: str,
        email: str,
        code_hash: str,
        *,
        expires_at: int,
        resend_after: int,
    ) -> None:
        now = int(time.time())
        key = self._password_reset_otp_key(user_id)
        try:
            self.table.put_item(
                Item={
                    **key,
                    "entity_type": "PASSWORD_RESET_OTP",
                    "user_id": user_id,
                    "email": email,
                    "code_hash": code_hash,
                    "attempts": 0,
                    "expires_at": expires_at,
                    "resend_after": resend_after,
                    "ttl": expires_at,
                    "created_at": utc_now(),
                },
                ConditionExpression="attribute_not_exists(PK) OR #resend <= :now",
                ExpressionAttributeNames={"#resend": "resend_after"},
                ExpressionAttributeValues={":now": now},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
            existing = self.table.get_item(Key=key, ConsistentRead=True).get("Item", {})
            retry_after = int(existing.get("resend_after", now + 1)) - now
            raise OtpRateLimitError(retry_after) from error

    def discard_password_reset_otp(self, user_id: str, code_hash: str) -> None:
        try:
            self.table.delete_item(
                Key=self._password_reset_otp_key(user_id),
                ConditionExpression="code_hash = :code_hash",
                ExpressionAttributeValues={":code_hash": code_hash},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException:
            pass

    def verify_password_reset_otp(self, user_id: str, code_hash: str) -> str:
        key = self._password_reset_otp_key(user_id)
        item = self.table.get_item(Key=key, ConsistentRead=True).get("Item")
        now = int(time.time())
        if not item or item.get("user_id") != user_id or int(item.get("expires_at", 0)) <= now:
            if item:
                self.table.delete_item(Key=key)
            raise OtpError("This verification code has expired. Request a new code.")

        attempts = int(item.get("attempts", 0))
        if attempts >= self.otp_max_attempts:
            self.table.delete_item(Key=key)
            raise OtpError("Too many incorrect attempts. Request a new code.")

        if not hmac.compare_digest(str(item.get("code_hash", "")), code_hash):
            attempts += 1
            if attempts >= self.otp_max_attempts:
                self.table.delete_item(Key=key)
                raise OtpError("Too many incorrect attempts. Request a new code.")
            self.table.update_item(
                Key=key,
                UpdateExpression="SET attempts = :attempts",
                ExpressionAttributeValues={":attempts": attempts},
                ConditionExpression="attribute_exists(PK)",
            )
            remaining = self.otp_max_attempts - attempts
            raise OtpError(f"The verification code is incorrect. {remaining} attempts remaining.")

        reset_token = new_verification_token()
        reset_key = self._password_reset_verification_key(reset_token)
        reset_expires = now + self.otp_verification_seconds
        client = self.table.meta.client
        try:
            client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table.name,
                            "Item": {
                                **reset_key,
                                "entity_type": "PASSWORD_RESET_VERIFICATION",
                                "user_id": user_id,
                                "expires_at": reset_expires,
                                "ttl": reset_expires,
                                "created_at": utc_now(),
                            },
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                    {
                        "Delete": {
                            "TableName": self.table.name,
                            "Key": key,
                            "ConditionExpression": "code_hash = :code_hash",
                            "ExpressionAttributeValues": {":code_hash": code_hash},
                        }
                    },
                ]
            )
        except client.exceptions.TransactionCanceledException as error:
            raise OtpError("Verification could not be completed. Request a new code.") from error
        return reset_token

    def complete_password_reset(self, reset_token: str, new_password: str) -> str:
        reset_key = self._password_reset_verification_key(reset_token)
        verification = self.table.get_item(Key=reset_key, ConsistentRead=True).get("Item")
        now = int(time.time())
        if not verification or int(verification.get("expires_at", 0)) <= now:
            if verification:
                self.table.delete_item(Key=reset_key)
            raise OtpError("Password reset verification expired. Request a new code.")

        user_id = str(verification.get("user_id", ""))
        auth_key = self._auth_key(user_id)
        auth = self.table.get_item(Key=auth_key, ConsistentRead=True).get("Item")
        if not auth:
            raise OtpError("This account is no longer available.")
        if verify_password(new_password, auth.get("password_hash", "")):
            raise ConflictError("Choose a password you have not used for this account.")

        sessions = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :session)",
            ExpressionAttributeValues={":pk": f"USER#{user_id}", ":session": "SESSION#"},
            ConsistentRead=True,
        ).get("Items", [])
        if len(sessions) > 96:
            raise OtpError("Password reset could not be completed. Contact support.")

        updated_at = utc_now()
        event_key = {
            "PK": f"USER#{user_id}",
            "SK": f"EVENT#{int(time.time() * 1000)}#{uuid4().hex[:10]}",
        }
        actions: list[dict[str, Any]] = [
            {
                "Update": {
                    "TableName": self.table.name,
                    "Key": auth_key,
                    "UpdateExpression": "SET password_hash = :password, updated_at = :updated",
                    "ExpressionAttributeValues": {
                        ":password": hash_password(new_password),
                        ":updated": updated_at,
                    },
                    "ConditionExpression": "attribute_exists(PK)",
                }
            },
            {
                "Delete": {
                    "TableName": self.table.name,
                    "Key": reset_key,
                    "ConditionExpression": "user_id = :user_id AND expires_at > :now",
                    "ExpressionAttributeValues": {":user_id": user_id, ":now": now},
                }
            },
            {
                "Put": {
                    "TableName": self.table.name,
                    "Item": {
                        **event_key,
                        "entity_type": "SECURITY_EVENT",
                        "id": event_key["SK"].removeprefix("EVENT#"),
                        "type": "password",
                        "title": "Password reset",
                        "detail": "Your password was reset using recovery email verification. All devices were signed out.",
                        "created_at": updated_at,
                    },
                    "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                }
            },
        ]
        actions.extend(
            {
                "Delete": {
                    "TableName": self.table.name,
                    "Key": {"PK": item["PK"], "SK": item["SK"]},
                }
            }
            for item in sessions
        )
        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            raise OtpError("Password reset could not be completed. Request a new code.") from error
        return user_id

    def create_account(
        self,
        payload: dict[str, Any],
        *,
        require_email_verification: bool = False,
    ) -> tuple[dict[str, Any], str]:
        user_id = f"usr_{uuid4().hex[:18]}"
        created_at = utc_now()
        handle = payload["handle"].strip().lower().removesuffix("@eyemail.in")
        eyemail = f"{handle}@eyemail.in"
        email = payload["secondary_email"].strip().lower()
        verification_token = payload.get("email_verification_token")
        verification_key = None
        if verification_token:
            verification_key = self._validated_signup_verification(email, verification_token)
        elif require_email_verification:
            raise OtpError("Verify your recovery email before creating the account.")
        phone = "".join(character for character in payload["phone"] if character.isdigit())
        if phone.startswith("91") and len(phone) == 12:
            phone = phone[2:]

        lookups = (("EYEMAIL", eyemail), ("EMAIL", email), ("PHONE", phone))
        for kind, value in lookups:
            if self.table.get_item(Key=self._lookup_key(kind, value), ConsistentRead=True).get("Item"):
                raise ConflictError("This Indo ID, email, or mobile number is already registered.")

        profile = {
            **self._profile_key(user_id),
            "entity_type": "USER_PROFILE",
            "user_id": user_id,
            "full_name": payload["full_name"].strip(),
            "nickname": payload["nickname"].strip(),
            "gender": payload.get("gender") or "Prefer not to say",
            "eyemail_id": eyemail,
            "secondary_email": email,
            "secondary_email_verified": verification_key is not None,
            "phone": phone,
            "phone_verified": False,
            "dob": payload["dob"],
            "language": payload.get("language") or "kn",
            "account_type": "Personal",
            "account_status": "ACTIVE",
            "two_step": True,
            "home_address": {},
            "work_address": {},
            "other_address": {},
            "created_at": created_at,
            "updated_at": created_at,
        }
        auth = {
            **self._auth_key(user_id),
            "entity_type": "PASSWORD_AUTH",
            "password_hash": hash_password(payload["password"]),
            "updated_at": created_at,
        }

        # Conditional writes protect each unique lookup. The transaction keeps
        # the profile, auth record and all lookup records atomic.
        client = self.table.meta.client
        account_event_key = {
            "PK": f"USER#{user_id}",
            "SK": f"EVENT#{int(time.time() * 1000)}#{uuid4().hex[:10]}",
        }
        puts = [
            profile,
            auth,
            {
                **account_event_key,
                "entity_type": "SECURITY_EVENT",
                "id": account_event_key["SK"].removeprefix("EVENT#"),
                "type": "account",
                "title": "Account created",
                "detail": "Your Indo Account was created and recovery email was verified.",
                "created_at": created_at,
            },
        ]
        puts.extend(
            {
                **self._lookup_key(kind, value),
                "entity_type": "IDENTITY_LOOKUP",
                "user_id": user_id,
                "created_at": created_at,
            }
            for kind, value in lookups
        )
        try:
            actions = [
                {
                    "Put": {
                        "TableName": self.table.name,
                        # The client attached to a DynamoDB resource has
                        # the document serializer registered already.
                        # Passing AttributeValue wrappers here would
                        # double-serialize PK/SK as maps.
                        "Item": item,
                        "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                    }
                }
                for item in puts
            ]
            if verification_key:
                actions.append(
                    {
                        "Delete": {
                            "TableName": self.table.name,
                            "Key": verification_key,
                            "ConditionExpression": "#email = :email AND #expires > :now",
                            "ExpressionAttributeNames": {
                                "#email": "email",
                                "#expires": "expires_at",
                            },
                            "ExpressionAttributeValues": {
                                ":email": email,
                                ":now": int(time.time()),
                            },
                        }
                    }
                )
            client.transact_write_items(
                TransactItems=actions
            )
        except client.exceptions.TransactionCanceledException as error:
            # Keep the public response generic, but retain the exact DynamoDB
            # cancellation codes in CloudWatch so a real conflict can be
            # distinguished from throttling or another transaction failure.
            reasons = (getattr(error, "response", {}) or {}).get("CancellationReasons") or []
            logger.error(
                "Signup transaction canceled; reason_details=%s",
                [
                    {
                        "code": reason.get("Code", "Unknown"),
                        "message": reason.get("Message", ""),
                    }
                    for reason in reasons
                ],
            )
            if verification_key and reasons and reasons[-1].get("Code") == "ConditionalCheckFailed":
                raise OtpError("Verify your recovery email again before creating the account.") from error
            raise ConflictError("This Indo ID, email, or mobile number is already registered.") from error

        token = self.create_bearer_session(user_id, payload.get("device", "Web browser"))
        return self.get_account_state(user_id, current_token=token), token

    @staticmethod
    def normalize_identifier(identifier: str) -> str:
        value = identifier.strip().lower()
        if "@" in value:
            return value
        value = "".join(character for character in value if character.isdigit())
        if value.startswith("91") and len(value) == 12:
            value = value[2:]
        return value

    def find_user_id(self, identifier: str) -> str | None:
        value = self.normalize_identifier(identifier)
        if "@" in value:
            kind = "EYEMAIL" if value.endswith("@eyemail.in") else "EMAIL"
        else:
            kind = "PHONE"
        item = self.table.get_item(Key=self._lookup_key(kind, value), ConsistentRead=True).get("Item")
        return item.get("user_id") if item else None

    def _login_rate_entries(
        self,
        subject: str,
        client_ip: str,
        *,
        now: int,
        window_seconds: int,
        account_limit: int,
        ip_limit: int,
    ) -> tuple[tuple[dict[str, str], int], ...]:
        return (
            (
                self._request_rate_key("LOGIN", f"account:{subject}", window_seconds, now),
                max(1, account_limit),
            ),
            (
                self._request_rate_key("LOGIN", f"ip:{client_ip}", window_seconds, now),
                max(1, ip_limit),
            ),
        )

    def _ensure_login_allowed(
        self,
        subject: str,
        client_ip: str,
        *,
        user_id: str | None,
        now: int,
        window_seconds: int,
        account_limit: int,
        ip_limit: int,
    ) -> None:
        window_seconds = max(60, window_seconds)
        entries = self._login_rate_entries(
            subject,
            client_ip,
            now=now,
            window_seconds=window_seconds,
            account_limit=account_limit,
            ip_limit=ip_limit,
        )
        blocked = any(
            int(self.table.get_item(Key=key, ConsistentRead=True).get("Item", {}).get("request_count", 0)) >= limit
            for key, limit in entries
        )
        if blocked:
            window_end = ((now // window_seconds) + 1) * window_seconds
            raise AuthenticationRateLimitError(window_end - now, user_id=user_id)

    def _record_login_failure(
        self,
        subject: str,
        client_ip: str,
        *,
        user_id: str | None,
        now: int,
        window_seconds: int,
        account_limit: int,
        ip_limit: int,
    ) -> None:
        window_seconds = max(60, window_seconds)
        window_end = ((now // window_seconds) + 1) * window_seconds
        entries = self._login_rate_entries(
            subject,
            client_ip,
            now=now,
            window_seconds=window_seconds,
            account_limit=account_limit,
            ip_limit=ip_limit,
        )
        actions = [
            {
                "Update": {
                    "TableName": self.table.name,
                    "Key": key,
                    "UpdateExpression": (
                        "SET entity_type = :entity, expires_at = :expires, #ttl = :ttl "
                        "ADD request_count :one"
                    ),
                    "ConditionExpression": (
                        "attribute_not_exists(request_count) OR request_count < :request_limit"
                    ),
                    "ExpressionAttributeValues": {
                        ":entity": "LOGIN_FAILURE_RATE_LIMIT",
                        ":expires": window_end,
                        ":ttl": window_end + 86_400,
                        ":one": 1,
                        ":request_limit": limit,
                    },
                    "ExpressionAttributeNames": {"#ttl": "ttl"},
                }
            }
            for key, limit in entries
        ]
        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            raise AuthenticationRateLimitError(window_end - now, user_id=user_id) from error

        counts = [
            int(self.table.get_item(Key=key, ConsistentRead=True).get("Item", {}).get("request_count", 0))
            for key, _limit in entries
        ]
        blocked = any(count >= limit for count, (_key, limit) in zip(counts, entries))
        if blocked:
            account_blocked = counts[0] >= entries[0][1]
            if user_id and account_blocked:
                self.record_security_event(
                    user_id,
                    "signin_blocked",
                    "Suspicious sign-in attempts blocked",
                    "Repeated unsuccessful sign-in attempts were temporarily blocked.",
                )
            raise AuthenticationRateLimitError(
                window_end - now,
                user_id=user_id,
                newly_blocked=bool(user_id and account_blocked),
            )

    def authenticate(
        self,
        identifier: str,
        password: str,
        device: str,
        *,
        client_ip: str = "unknown",
        now: int | None = None,
        rate_window_seconds: int = 900,
        account_failure_limit: int = 5,
        ip_failure_limit: int = 20,
    ) -> tuple[dict[str, Any], str]:
        now = int(time.time()) if now is None else now
        user_id = self.find_user_id(identifier)
        normalized = self.normalize_identifier(identifier)
        subject = user_id or f"unknown:{normalized}"
        self._ensure_login_allowed(
            subject,
            client_ip,
            user_id=user_id,
            now=now,
            window_seconds=rate_window_seconds,
            account_limit=account_failure_limit,
            ip_limit=ip_failure_limit,
        )
        if not user_id:
            verify_password(password, DUMMY_PASSWORD_HASH)
            self._record_login_failure(
                subject,
                client_ip,
                user_id=None,
                now=now,
                window_seconds=rate_window_seconds,
                account_limit=account_failure_limit,
                ip_limit=ip_failure_limit,
            )
            raise AuthenticationError("Identifier or password is incorrect.")
        auth = self.table.get_item(Key=self._auth_key(user_id), ConsistentRead=True).get("Item")
        valid_password = verify_password(password, auth.get("password_hash", "") if auth else DUMMY_PASSWORD_HASH)
        if not auth or not valid_password:
            self._record_login_failure(
                subject,
                client_ip,
                user_id=user_id,
                now=now,
                window_seconds=rate_window_seconds,
                account_limit=account_failure_limit,
                ip_limit=ip_failure_limit,
            )
            raise AuthenticationError("Identifier or password is incorrect.")

        account_rate_key = self._request_rate_key(
            "LOGIN",
            f"account:{subject}",
            max(60, rate_window_seconds),
            now,
        )
        self.table.delete_item(Key=account_rate_key)
        token = self.create_bearer_session(user_id, device)
        self.record_security_event(user_id, "signin", "New sign-in", f"Your Indo Account was signed in on {device}.")
        return self.get_account_state(user_id, current_token=token), token

    def create_session(self, user_id: str, device: str) -> str:
        token = new_session_token()
        session_id = f"sess_{uuid4().hex[:18]}"
        current_epoch = int(time.time())
        response = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :session)",
            ExpressionAttributeValues={":pk": f"USER#{user_id}", ":session": "SESSION#"},
            ConsistentRead=True,
        )
        sessions = response.get("Items", [])
        expired = [item for item in sessions if int(item.get("ttl", 0)) <= current_epoch]
        active = [item for item in sessions if int(item.get("ttl", 0)) > current_epoch]
        active.sort(key=lambda item: str(item.get("created_at", "")))
        overflow = active[: max(0, len(active) - self.session_max_active + 1)]
        stale = expired + overflow
        if stale:
            with self.table.batch_writer() as batch:
                for item in stale:
                    batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
        self.table.put_item(
            Item={
                "PK": f"USER#{user_id}",
                "SK": f"SESSION#{session_id}",
                "entity_type": "SESSION",
                "session_id": session_id,
                "token_hash": token_digest(token),
                "device": device,
                "app": "Indo Account",
                "created_at": utc_now(),
                "last_active": utc_now(),
                "last_active_epoch": current_epoch,
                "ttl": current_epoch + self.session_seconds,
            }
        )
        return token

    def user_from_token(self, token: str) -> str:
        # Token hashes are not primary keys, so the caller supplies the user id
        # encoded alongside the opaque token in the Authorization credential.
        try:
            user_id, opaque = token.split(".", 1)
        except ValueError as error:
            raise AuthenticationError("Session is invalid.") from error
        response = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :session)",
            ExpressionAttributeValues={":pk": f"USER#{user_id}", ":session": "SESSION#"},
            ConsistentRead=True,
        )
        digest = token_digest(opaque)
        session = next((item for item in response.get("Items", []) if item.get("token_hash") == digest), None)
        if not session or int(session.get("ttl", 0)) <= int(time.time()):
            raise AuthenticationError("Session has expired.")
        now = int(time.time())
        if now - int(session.get("last_active_epoch", 0)) >= self.session_activity_update_seconds:
            try:
                self.table.update_item(
                    Key={"PK": session["PK"], "SK": session["SK"]},
                    UpdateExpression="SET last_active = :active, last_active_epoch = :epoch",
                    ConditionExpression="token_hash = :digest AND ttl > :now",
                    ExpressionAttributeValues={
                        ":active": utc_now(),
                        ":epoch": now,
                        ":digest": digest,
                        ":now": now,
                    },
                )
            except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
                raise AuthenticationError("Session has expired.") from error
        return user_id

    def create_bearer_session(self, user_id: str, device: str) -> str:
        return f"{user_id}.{self.create_session(user_id, device)}"

    def current_session_id(self, user_id: str, token: str) -> str:
        try:
            token_user_id, opaque = token.split(".", 1)
        except ValueError as error:
            raise AuthenticationError("Session is invalid.") from error
        if token_user_id != user_id:
            raise AuthenticationError("Session is invalid.")
        digest = token_digest(opaque)
        response = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :session)",
            ExpressionAttributeValues={":pk": f"USER#{user_id}", ":session": "SESSION#"},
            ConsistentRead=True,
        )
        session = next((item for item in response.get("Items", []) if item.get("token_hash") == digest), None)
        if not session or int(session.get("ttl", 0)) <= int(time.time()):
            raise AuthenticationError("Session has expired.")
        return str(session.get("session_id") or session["SK"].removeprefix("SESSION#"))

    def get_profile(self, user_id: str) -> dict[str, Any]:
        item = self.table.get_item(Key=self._profile_key(user_id), ConsistentRead=True).get("Item")
        if not item:
            raise NotFoundError("Account was not found.")
        return self._public(item)

    def get_account_state(self, user_id: str, *, current_token: str | None = None) -> dict[str, Any]:
        profile = self.get_profile(user_id)
        current_session_id = self.current_session_id(user_id, current_token) if current_token else None
        response = self.table.query(
            KeyConditionExpression="PK = :pk",
            ExpressionAttributeValues={":pk": f"USER#{user_id}"},
            ConsistentRead=True,
        )
        items = response.get("Items", [])
        apps = {key: {**value, "key": key} for key, value in self.APP_DEFAULTS.items()}
        notifications = {"security": True, "signin": True, "account": True, "updates": True, "billing": True, "news": False}
        billing = {"company": "", "gstin": "", "address": "", "state": ""}
        sessions: list[dict[str, Any]] = []
        connections: list[dict[str, Any]] = []
        invoices: list[dict[str, Any]] = []
        security_events: list[dict[str, Any]] = []
        for item in items:
            sort_key = item.get("SK", "")
            if sort_key.startswith("APP#") and sort_key.endswith("#STATE"):
                key = sort_key.split("#")[1]
                if key in apps:
                    apps[key] = {**apps[key], **item.get("state", {}), "key": key}
            elif sort_key == "SETTINGS#NOTIFICATIONS":
                notifications.update(item.get("state", {}))
            elif sort_key == "BILLING#PROFILE":
                billing.update(item.get("state", {}))
            elif sort_key.startswith("SESSION#"):
                if int(item.get("ttl", 0)) <= int(time.time()):
                    continue
                session = self._public(item)
                session.pop("token_hash", None)
                session["current"] = session.get("session_id") == current_session_id
                sessions.append(session)
            elif sort_key.startswith("CONNECTION#"):
                connections.append(self._public(item))
            elif sort_key.startswith("INVOICE#"):
                invoices.append(self._public(item))
            elif sort_key.startswith("EVENT#"):
                security_events.append(self._public(item))
        security_events.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
        return {
            **profile,
            "apps": apps,
            "notifications": notifications,
            "billing": billing,
            "sessions": sessions,
            "oauth_connections": connections,
            "invoices": invoices,
            "security_events": security_events[:30],
        }

    def export_account_data(self, user_id: str, verification_token: str) -> dict[str, Any]:
        self.consume_security_verification(user_id, "export_data", verification_token)
        state = self.get_account_state(user_id)
        export = {
            "export_version": "1.0",
            "exported_at": utc_now(),
            "account": {
                key: state.get(key)
                for key in ("user_id", "eyemail_id", "account_type", "account_status", "created_at", "updated_at")
            },
            "profile": {
                "full_name": state.get("full_name"),
                "nickname": state.get("nickname"),
                "gender": state.get("gender"),
                "date_of_birth": state.get("dob"),
                "preferred_language": state.get("language"),
                "profile_photo": state.get("profile_photo", ""),
                "recovery_email": state.get("secondary_email"),
                "recovery_email_verified": bool(state.get("secondary_email_verified")),
                "mobile_number": state.get("phone"),
                "mobile_number_verified": bool(state.get("phone_verified")),
                "addresses": {
                    "home": state.get("home_address", {}),
                    "work": state.get("work_address", {}),
                    "other": state.get("other_address", {}),
                },
            },
            "apps": state.get("apps", {}),
            "connections": state.get("oauth_connections", []),
            "sessions": state.get("sessions", []),
            "security": {
                "two_step": bool(state.get("two_step")),
                "events": state.get("security_events", []),
            },
            "notifications": state.get("notifications", {}),
            "billing": state.get("billing", {}),
            "invoices": state.get("invoices", []),
        }
        self.record_security_event(user_id, "privacy", "Account data downloaded", "A secure copy of your Indo Account data was downloaded.")
        return export

    def revoke_session(self, user_id: str, session_id: str) -> None:
        key = {"PK": f"USER#{user_id}", "SK": f"SESSION#{session_id}"}
        try:
            self.table.delete_item(
                Key=key,
                ConditionExpression="attribute_exists(PK) AND session_id = :session_id",
                ExpressionAttributeValues={":session_id": session_id},
            )
        except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
            raise NotFoundError("This device session is no longer active.") from error
        self.record_security_event(user_id, "session", "Device signed out", "A device session was removed from your Indo Account.")

    def revoke_sessions(self, user_id: str, *, current_token: str, include_current: bool) -> int:
        current_session_id = self.current_session_id(user_id, current_token)
        response = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :session)",
            ExpressionAttributeValues={":pk": f"USER#{user_id}", ":session": "SESSION#"},
            ConsistentRead=True,
        )
        sessions = [
            item
            for item in response.get("Items", [])
            if include_current or item.get("session_id") != current_session_id
        ]
        if sessions:
            with self.table.batch_writer() as batch:
                for item in sessions:
                    batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            self.record_security_event(
                user_id,
                "session",
                "All devices signed out" if include_current else "Other devices signed out",
                f"{len(sessions)} active device session{'s were' if len(sessions) != 1 else ' was'} removed.",
            )
        return len(sessions)

    def sync_account_state(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        partition = f"USER#{user_id}"
        for key, state in (payload.get("apps") or {}).items():
            if key not in self.APP_DEFAULTS or not isinstance(state, dict):
                continue
            clean = {field: state[field] for field in ("name", "status", "connected", "plan", "quota", "renewal", "last_used", "data") if field in state}
            self.table.put_item(Item={"PK": partition, "SK": f"APP#{key}#STATE", "entity_type": "APP_STATE", "state": clean, "updated_at": utc_now()})
        if isinstance(payload.get("notifications"), dict):
            allowed = {"security", "signin", "account", "updates", "billing", "news"}
            clean = {key: bool(value) for key, value in payload["notifications"].items() if key in allowed}
            self.table.put_item(Item={"PK": partition, "SK": "SETTINGS#NOTIFICATIONS", "entity_type": "NOTIFICATION_SETTINGS", "state": clean, "updated_at": utc_now()})
        if isinstance(payload.get("billing"), dict):
            allowed = {"company", "gstin", "address", "state"}
            clean = {key: str(value)[:500] for key, value in payload["billing"].items() if key in allowed}
            self.table.put_item(Item={"PK": partition, "SK": "BILLING#PROFILE", "entity_type": "BILLING_PROFILE", "state": clean, "updated_at": utc_now()})
        return self.get_account_state(user_id)

    def set_two_step(
        self,
        user_id: str,
        enabled: bool,
        *,
        verification_token: str | None = None,
        require_verification: bool = False,
    ) -> dict[str, Any]:
        profile = self.table.get_item(Key=self._profile_key(user_id), ConsistentRead=True).get("Item")
        if not profile:
            raise NotFoundError("Account was not found.")
        current = bool(profile.get("two_step"))
        if current == enabled:
            return self.get_account_state(user_id)
        verification_key = None
        if current and not enabled and (require_verification or verification_token):
            verification_key = self.validated_security_verification(
                user_id,
                "disable_two_step",
                verification_token or "",
            )
        updated_at = utc_now()
        event_key = {
            "PK": f"USER#{user_id}",
            "SK": f"EVENT#{int(time.time() * 1000)}#{uuid4().hex[:10]}",
        }
        actions: list[dict[str, Any]] = [
            {
                "Update": {
                    "TableName": self.table.name,
                    "Key": self._profile_key(user_id),
                    "UpdateExpression": "SET two_step = :enabled, updated_at = :updated",
                    "ConditionExpression": "attribute_exists(PK) AND two_step = :current",
                    "ExpressionAttributeValues": {
                        ":enabled": enabled,
                        ":updated": updated_at,
                        ":current": current,
                    },
                }
            },
            {
                "Put": {
                    "TableName": self.table.name,
                    "Item": {
                        **event_key,
                        "entity_type": "SECURITY_EVENT",
                        "id": event_key["SK"].removeprefix("EVENT#"),
                        "type": "two_step",
                        "title": f"Two-step protection {'enabled' if enabled else 'disabled'}",
                        "detail": f"Recovery email OTP protection was turned {'on' if enabled else 'off'}.",
                        "created_at": updated_at,
                    },
                    "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                }
            },
        ]
        if verification_key:
            actions.append(
                {
                    "Delete": {
                        "TableName": self.table.name,
                        "Key": verification_key,
                        "ConditionExpression": "user_id = :user_id AND #action = :action AND expires_at > :now",
                        "ExpressionAttributeNames": {"#action": "action"},
                        "ExpressionAttributeValues": {
                            ":user_id": user_id,
                            ":action": "disable_two_step",
                            ":now": int(time.time()),
                        },
                    }
                }
            )
        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            raise OtpError("Two-step protection could not be updated. Verify again.") from error
        return self.get_account_state(user_id)

    def change_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str,
        *,
        verification_token: str | None = None,
        require_verification: bool = False,
    ) -> None:
        auth = self.table.get_item(Key=self._auth_key(user_id), ConsistentRead=True).get("Item")
        if not auth or not verify_password(current_password, auth.get("password_hash", "")):
            raise AuthenticationError("Current password is incorrect.")
        if verify_password(new_password, auth["password_hash"]):
            raise ConflictError("Choose a password you have not used for this account.")
        profile = self.table.get_item(Key=self._profile_key(user_id), ConsistentRead=True).get("Item")
        if not profile:
            raise NotFoundError("Account was not found.")
        verification_key = None
        if profile.get("two_step") and (require_verification or verification_token):
            verification_key = self.validated_security_verification(
                user_id,
                "change_password",
                verification_token or "",
            )
        updated_at = utc_now()
        event_key = {
            "PK": f"USER#{user_id}",
            "SK": f"EVENT#{int(time.time() * 1000)}#{uuid4().hex[:10]}",
        }
        actions: list[dict[str, Any]] = [
            {
                "Update": {
                    "TableName": self.table.name,
                    "Key": self._auth_key(user_id),
                    "UpdateExpression": "SET password_hash = :password, updated_at = :updated",
                    "ExpressionAttributeValues": {
                        ":password": hash_password(new_password),
                        ":updated": updated_at,
                    },
                    "ConditionExpression": "attribute_exists(PK)",
                }
            },
            {
                "Put": {
                    "TableName": self.table.name,
                    "Item": {
                        **event_key,
                        "entity_type": "SECURITY_EVENT",
                        "id": event_key["SK"].removeprefix("EVENT#"),
                        "type": "password",
                        "title": "Password changed",
                        "detail": "Your Indo Account password was updated.",
                        "created_at": updated_at,
                    },
                    "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                }
            },
        ]
        if verification_key:
            actions.append(
                {
                    "Delete": {
                        "TableName": self.table.name,
                        "Key": verification_key,
                        "ConditionExpression": "user_id = :user_id AND #action = :action AND expires_at > :now",
                        "ExpressionAttributeNames": {"#action": "action"},
                        "ExpressionAttributeValues": {
                            ":user_id": user_id,
                            ":action": "change_password",
                            ":now": int(time.time()),
                        },
                    }
                }
            )
        client = self.table.meta.client
        try:
            client.transact_write_items(TransactItems=actions)
        except client.exceptions.TransactionCanceledException as error:
            raise OtpError("Password could not be changed. Verify again.") from error

    def revoke_token(self, token: str) -> None:
        try:
            user_id, opaque = token.split(".", 1)
        except ValueError:
            return
        response = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :session)",
            ExpressionAttributeValues={":pk": f"USER#{user_id}", ":session": "SESSION#"},
            ConsistentRead=True,
        )
        digest = token_digest(opaque)
        session = next((item for item in response.get("Items", []) if item.get("token_hash") == digest), None)
        if session:
            self.table.delete_item(Key={"PK": session["PK"], "SK": session["SK"]})

    def update_profile(self, user_id: str, changes: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "full_name",
            "nickname",
            "gender",
            "dob",
            "language",
            "profile_photo",
            "home_address",
            "work_address",
            "other_address",
        }
        clean = {key: value for key, value in changes.items() if key in allowed}
        if not clean:
            return self.get_account_state(user_id)
        clean["updated_at"] = utc_now()
        names = {f"#{key}": key for key in clean}
        values = {f":{key}": value for key, value in clean.items()}
        expression = "SET " + ", ".join(f"#{key} = :{key}" for key in clean)
        result = self.table.update_item(
            Key=self._profile_key(user_id),
            UpdateExpression=expression,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ConditionExpression="attribute_exists(PK)",
            ReturnValues="ALL_NEW",
        )
        visible_fields = [key.replace("_", " ") for key in clean if key != "updated_at"]
        if visible_fields:
            self.record_security_event(
                user_id,
                "profile",
                "Personal information updated",
                f"Updated: {', '.join(visible_fields)}.",
            )
        return self.get_account_state(user_id)

    def delete_account(
        self,
        user_id: str,
        *,
        verification_token: str | None = None,
        require_verification: bool = False,
    ) -> None:
        partition = f"USER#{user_id}"
        response = self.table.query(
            KeyConditionExpression="PK = :pk",
            ExpressionAttributeValues={":pk": partition},
            ConsistentRead=True,
        )
        profile = next((item for item in response.get("Items", []) if item.get("SK") == "PROFILE"), None)
        if not profile:
            raise NotFoundError("Account was not found.")
        verification_key = None
        if profile.get("two_step") and (require_verification or verification_token):
            verification_key = self.validated_security_verification(
                user_id,
                "delete_account",
                verification_token or "",
            )
            try:
                self.table.delete_item(
                    Key=verification_key,
                    ConditionExpression="user_id = :user_id AND #action = :action AND expires_at > :now",
                    ExpressionAttributeNames={"#action": "action"},
                    ExpressionAttributeValues={
                        ":user_id": user_id,
                        ":action": "delete_account",
                        ":now": int(time.time()),
                    },
                )
            except self.table.meta.client.exceptions.ConditionalCheckFailedException as error:
                raise OtpError("Account deletion verification expired. Request a new code.") from error
        lookup_keys = []
        for kind, field in self.LOOKUP_FIELDS.items():
            value = profile.get(field)
            if value:
                lookup_keys.append(self._lookup_key(kind, value))
        with self.table.batch_writer() as batch:
            for item in response.get("Items", []):
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            for key in lookup_keys:
                batch.delete_item(Key=key)


