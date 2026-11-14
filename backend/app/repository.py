from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from .security import hash_password, new_session_token, token_digest, verify_password


logger = logging.getLogger(__name__)


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class ConflictError(Exception):
    pass


class AuthenticationError(Exception):
    pass


class NotFoundError(Exception):
    pass


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

    def __init__(self, table: Any, *, session_days: int = 30):
        self.table = table
        self.session_seconds = session_days * 86_400

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
    def _public(item: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in item.items() if key not in {"PK", "SK", "password_hash"}}

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

    def create_account(self, payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
        user_id = f"usr_{uuid4().hex[:18]}"
        created_at = utc_now()
        handle = payload["handle"].strip().lower().removesuffix("@eyemail.in")
        eyemail = f"{handle}@eyemail.in"
        email = payload["secondary_email"].strip().lower()
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
            "secondary_email_verified": bool(payload.get("secondary_email_verified")),
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
        serializer = self._serializer()
        puts = [profile, auth]
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
            client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table.name,
                            "Item": serializer(item),
                            "ConditionExpression": "attribute_not_exists(PK) AND attribute_not_exists(SK)",
                        }
                    }
                    for item in puts
                ]
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
            raise ConflictError("This Indo ID, email, or mobile number is already registered.") from error

        token = self.create_bearer_session(user_id, payload.get("device", "Web browser"))
        return self.get_account_state(user_id), token

    @staticmethod
    def _serializer():
        from boto3.dynamodb.types import TypeSerializer

        serializer = TypeSerializer()

        def serialize_item(item: dict[str, Any]) -> dict[str, dict[str, Any]]:
            # TypeSerializer returns a top-level {"M": {...}} for a Python
            # mapping. TransactWriteItems expects the inner attribute-value
            # mapping as its Item payload.
            return serializer.serialize(item)["M"]

        return serialize_item

    def find_user_id(self, identifier: str) -> str | None:
        value = identifier.strip().lower()
        if "@" in value:
            kind = "EYEMAIL" if value.endswith("@eyemail.in") else "EMAIL"
        else:
            kind = "PHONE"
            value = "".join(character for character in value if character.isdigit())
            if value.startswith("91") and len(value) == 12:
                value = value[2:]
        item = self.table.get_item(Key=self._lookup_key(kind, value), ConsistentRead=True).get("Item")
        return item.get("user_id") if item else None

    def authenticate(self, identifier: str, password: str, device: str) -> tuple[dict[str, Any], str]:
        user_id = self.find_user_id(identifier)
        if not user_id:
            raise AuthenticationError("Identifier or password is incorrect.")
        auth = self.table.get_item(Key=self._auth_key(user_id), ConsistentRead=True).get("Item")
        if not auth or not verify_password(password, auth.get("password_hash", "")):
            raise AuthenticationError("Identifier or password is incorrect.")
        token = self.create_bearer_session(user_id, device)
        return self.get_account_state(user_id), token

    def create_session(self, user_id: str, device: str) -> str:
        token = new_session_token()
        session_id = f"sess_{uuid4().hex[:18]}"
        current_epoch = int(time.time())
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
        return user_id

    def create_bearer_session(self, user_id: str, device: str) -> str:
        return f"{user_id}.{self.create_session(user_id, device)}"

    def get_profile(self, user_id: str) -> dict[str, Any]:
        item = self.table.get_item(Key=self._profile_key(user_id), ConsistentRead=True).get("Item")
        if not item:
            raise NotFoundError("Account was not found.")
        return self._public(item)

    def get_account_state(self, user_id: str) -> dict[str, Any]:
        profile = self.get_profile(user_id)
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
                session = self._public(item)
                session.pop("token_hash", None)
                sessions.append(session)
            elif sort_key.startswith("CONNECTION#"):
                connections.append(self._public(item))
            elif sort_key.startswith("INVOICE#"):
                invoices.append(self._public(item))
            elif sort_key.startswith("EVENT#"):
                security_events.append(self._public(item))
        return {
            **profile,
            "apps": apps,
            "notifications": notifications,
            "billing": billing,
            "sessions": sessions,
            "oauth_connections": connections,
            "invoices": invoices,
            "security_events": security_events,
        }

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

    def set_two_step(self, user_id: str, enabled: bool) -> dict[str, Any]:
        self.table.update_item(
            Key=self._profile_key(user_id),
            UpdateExpression="SET two_step = :enabled, updated_at = :updated",
            ExpressionAttributeValues={":enabled": enabled, ":updated": utc_now()},
            ConditionExpression="attribute_exists(PK)",
        )
        return self.get_account_state(user_id)

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        auth = self.table.get_item(Key=self._auth_key(user_id), ConsistentRead=True).get("Item")
        if not auth or not verify_password(current_password, auth.get("password_hash", "")):
            raise AuthenticationError("Current password is incorrect.")
        if verify_password(new_password, auth["password_hash"]):
            raise ConflictError("Choose a password you have not used for this account.")
        self.table.update_item(
            Key=self._auth_key(user_id),
            UpdateExpression="SET password_hash = :password, updated_at = :updated",
            ExpressionAttributeValues={":password": hash_password(new_password), ":updated": utc_now()},
            ConditionExpression="attribute_exists(PK)",
        )

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
        return self.get_account_state(user_id)

    def delete_account(self, user_id: str) -> None:
        partition = f"USER#{user_id}"
        response = self.table.query(
            KeyConditionExpression="PK = :pk",
            ExpressionAttributeValues={":pk": partition},
            ConsistentRead=True,
        )
        profile = next((item for item in response.get("Items", []) if item.get("SK") == "PROFILE"), None)
        lookup_keys = []
        if profile:
            for kind, field in self.LOOKUP_FIELDS.items():
                value = profile.get(field)
                if value:
                    lookup_keys.append(self._lookup_key(kind, value))
        with self.table.batch_writer() as batch:
            for item in response.get("Items", []):
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            for key in lookup_keys:
                batch.delete_item(Key=key)


