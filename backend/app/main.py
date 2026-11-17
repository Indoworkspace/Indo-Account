from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
import time
from typing import Annotated, Any, Literal
from urllib.parse import quote
from uuid import uuid4

import boto3
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from mangum import Mangum
from pydantic import BaseModel, EmailStr, Field, field_validator

from .config import settings
from .emailer import EmailConfigurationError, EmailDeliveryError, EyemailSender
from .repository import (
    AppPausedError,
    AuthenticationError,
    AuthenticationRateLimitError,
    ConflictError,
    DynamoAccountRepository,
    NotFoundError,
    OtpError,
    OtpRateLimitError,
    PayloadTooLargeError,
    RequestRateLimitError,
)
from .security import challenge_digest, new_otp_code, new_verification_token, otp_digest, token_digest


def build_repository() -> DynamoAccountRepository:
    resource = boto3.resource("dynamodb", region_name=settings.aws_region)
    return DynamoAccountRepository(
        resource.Table(settings.table_name),
        session_days=settings.session_days,
        session_max_active=settings.session_max_active,
        session_activity_update_seconds=settings.session_activity_update_seconds,
        otp_max_attempts=settings.otp_max_attempts,
        otp_verification_seconds=settings.otp_verification_seconds,
        app_token_days=settings.app_token_days,
        app_code_seconds=settings.app_code_seconds,
        app_history_limit=settings.app_history_limit,
        app_saved_limit=settings.app_saved_limit,
        app_box_max_bytes=settings.app_box_max_bytes,
        app_max_sessions=settings.app_max_sessions,
    )


repository = build_repository()
# Eyemail is the only mail transport. It stores internal mail in Firestore and relays
# external mail itself, so this service no longer talks to SES at all.
email_sender = EyemailSender(
    settings.eyemail_backend_url,
    secret=settings.eyemail_internal_secret,
    sender_name="Indo Security Team",
    timeout=settings.eyemail_timeout_seconds,
)
# Lambda does not configure logging, so the root logger stays at WARNING and every
# `logger.info` was silently dropped — only exceptions ever reached CloudWatch, which made a
# quiet log look like proof that nothing happened. Give the root logger a handler and a level
# once, so each decision is visible.
if not logging.getLogger().handlers:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(levelname)s %(name)s %(message)s")
else:
    logging.getLogger().setLevel(os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)
app = FastAPI(title="Indo Account API", version="1.0.0", docs_url=None, redoc_url=None)


def add_security_headers(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.middleware("http")
async def api_security_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            body_size = int(content_length)
        except ValueError:
            return add_security_headers(JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."}))
        if body_size > settings.max_request_bytes:
            return add_security_headers(JSONResponse(status_code=413, content={"detail": "Request body is too large."}))
        content_type = request.headers.get("content-type", "").lower()
        if (
            body_size > 0
            and request.url.path.startswith("/api/")
            and request.method in {"POST", "PATCH", "DELETE"}
            and not content_type.startswith("application/json")
        ):
            return add_security_headers(JSONResponse(status_code=415, content={"detail": "Content-Type must be application/json."}))

    response = await call_next(request)
    return add_security_headers(response)


class EmailOtpRequest(BaseModel):
    email: EmailStr


class EmailOtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class RecoveryEmailOtpRequest(BaseModel):
    email: EmailStr


class RecoveryEmailOtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


RESERVED_INDO_IDS = {
    "admin", "administrator", "support", "noreply", "verify", "security", "indo",
    "indoworkspace", "eyesearch", "sankalp", "eyebrowse", "help", "billing", "account", "privacy",
}


def normalize_indo_handle(value: str) -> str:
    handle = value.strip().lower().removesuffix("@eyemail.in")
    valid = bool(re.fullmatch(r"[a-z0-9](?:[a-z0-9._]{4,28}[a-z0-9])", handle))
    if not valid or ".." in handle or "__" in handle or handle in RESERVED_INDO_IDS:
        raise ValueError("Use 6–30 lowercase letters, numbers, dots, or underscores. Start and end with a letter or number.")
    return handle


class IndoIdAvailabilityRequest(BaseModel):
    handle: str = Field(min_length=6, max_length=41)

    @field_validator("handle")
    @classmethod
    def valid_handle(cls, value: str) -> str:
        return normalize_indo_handle(value)


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    nickname: str = Field(min_length=2, max_length=30)
    handle: str = Field(min_length=6, max_length=41, pattern=r"^[a-z0-9._]+(?:@eyemail\.in)?$")
    secondary_email: EmailStr
    email_verification_token: str | None = Field(default=None, min_length=32, max_length=512)
    phone: str = Field(pattern=r"^(?:\+?91)?[6-9]\d{9}$")
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    language: str = Field(default="kn", pattern=r"^(kn|en|hi)$")
    gender: str | None = None
    password: str = Field(min_length=8, max_length=64)
    device: str = Field(default="Web browser", max_length=120)

    @field_validator("handle")
    @classmethod
    def valid_handle(cls, value: str) -> str:
        return normalize_indo_handle(value)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        tests = (any(c.islower() for c in value), any(c.isupper() for c in value), any(c.isdigit() for c in value), any(not c.isalnum() for c in value))
        if not all(tests):
            raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
        return value


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=64)
    device: str = Field(default="Web browser", max_length=120)


class PasswordResetRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)


class PasswordResetVerify(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    code: str = Field(pattern=r"^\d{6}$")


class PasswordResetComplete(BaseModel):
    reset_token: str = Field(min_length=32, max_length=512)
    new_password: str = Field(min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        tests = (any(c.islower() for c in value), any(c.isupper() for c in value), any(c.isdigit() for c in value), any(not c.isalnum() for c in value))
        if not all(tests):
            raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
        return value


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=80)
    nickname: str | None = Field(default=None, min_length=2, max_length=30)
    gender: str | None = Field(default=None, max_length=40)
    dob: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    language: str | None = Field(default=None, pattern=r"^(kn|en|hi)$")
    profile_photo: str | None = Field(default=None, max_length=2_000_000)
    home_address: dict[str, str] | None = None
    work_address: dict[str, str] | None = None
    other_address: dict[str, str] | None = None


class AccountStateSync(BaseModel):
    apps: dict[str, dict[str, Any]] | None = None
    notifications: dict[str, bool] | None = None
    billing: dict[str, Any] | None = None


class TwoStepUpdate(BaseModel):
    enabled: bool
    verification_token: str | None = Field(default=None, min_length=32, max_length=512)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=8, max_length=64)
    verification_token: str | None = Field(default=None, min_length=32, max_length=512)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        tests = (any(c.islower() for c in value), any(c.isupper() for c in value), any(c.isdigit() for c in value), any(not c.isalnum() for c in value))
        if not all(tests):
            raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
        return value


SecurityAction = Literal["change_password", "disable_two_step", "delete_account", "export_data"]


class SecurityOtpRequest(BaseModel):
    action: SecurityAction


class SecurityOtpVerify(BaseModel):
    action: SecurityAction
    code: str = Field(pattern=r"^\d{6}$")


class AccountDelete(BaseModel):
    verification_token: str | None = Field(default=None, min_length=32, max_length=512)


class AccountExport(BaseModel):
    verification_token: str = Field(min_length=32, max_length=512)


class SupportRequest(BaseModel):
    category: Literal["Account access", "Security", "Personal information", "Data & privacy", "Other"]
    message: str = Field(min_length=20, max_length=2000)


AppKey = Literal["SANKALPA", "EYESEARCH", "EYEBROWSE", "EYEMAIL"]


class AppAuthorizeRequest(BaseModel):
    redirect: str = Field(min_length=8, max_length=200)
    code_challenge: str = Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    state: str = Field(default="", max_length=200)


class AppSessionExchange(BaseModel):
    app: AppKey
    code: str = Field(min_length=32, max_length=200)
    code_verifier: str = Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9._~-]+$")
    device: str = Field(default="Indo app", max_length=120)


class SecurityEventDelete(BaseModel):
    ids: list[str] | None = Field(default=None, max_length=200)


class PanelSessionRequest(BaseModel):
    device: str = Field(default="Indo app", max_length=120)


class AppStatusUpdate(BaseModel):
    status: Literal["Active", "Paused"]


class AppPreferencesUpdate(BaseModel):
    preferences: dict[str, Any] = Field(default_factory=dict)


class AppSavedCreate(BaseModel):
    title: str = Field(default="", max_length=300)
    url: str = Field(min_length=4, max_length=2000)


class AppHistoryEntry(BaseModel):
    url: str | None = Field(default=None, max_length=2000)
    origin: str | None = Field(default=None, max_length=2000)
    title: str | None = Field(default=None, max_length=300)
    visited_at: str | None = Field(default=None, max_length=40)
    visits: int | None = Field(default=None, ge=1, le=1000)


class AppHistoryBatch(BaseModel):
    entries: list[AppHistoryEntry] = Field(min_length=1, max_length=100)


# Registered first-party clients. The redirect prefix must match exactly; a
# redirect to any other scheme or host is refused.
APP_CLIENTS = {
    "SANKALPA": {"name": "Sankalp", "redirect_prefixes": ("sankalp://", "https://sankalp.indoworkspace.in/")},
    "EYESEARCH": {"name": "Eyesearch Search Engine", "redirect_prefixes": ("eyesearch://", "https://eyesearch.indoworkspace.in/")},
    "EYEBROWSE": {"name": "Eyebrowse Browser", "redirect_prefixes": ("indobrowse://",)},
    "EYEMAIL": {
        "name": "Eyemail",
        "redirect_prefixes": (
            "https://eyemail.in/",
            "https://www.eyemail.in/",
            "https://indoworkspace.github.io/eyemail-frontend/",
        ),
    },
}


SECURITY_ACTION_LABELS = {
    "change_password": "changing your password",
    "disable_two_step": "turning off two-step protection",
    "delete_account": "permanently deleting your Indo Account",
    "export_data": "downloading a copy of your Indo Account data",
}


def register_eyemail_mailbox(profile: dict[str, Any]) -> None:
    """Create the @eyemail.in mailbox for a brand-new account.

    The mailbox is the account: the address is the person's Indo ID, and mail has to arrive at
    it. So this is not best-effort - it raises, and the caller rolls the account back if the
    mailbox could not be made. Signing up without a mailbox would leave an account that cannot
    receive anything.
    """
    user_id = str(profile.get("user_id") or "")
    address = str(profile.get("eyemail_id") or "")
    username = address.split("@")[0] if "@" in address else address
    if not user_id or not username:
        raise EmailConfigurationError("The account has no address to give a mailbox.")
    email_sender.register_mailbox(
        user_id=user_id,
        username=username,
        name=str(profile.get("full_name") or ""),
        recovery_email=str(profile.get("secondary_email") or ""),
    )
    logger.info("mailbox registered user=%s", user_id)


def finish_pending_mailbox(state: dict[str, Any]) -> dict[str, Any]:
    """Try once more to create a mailbox that a previous attempt did not confirm.

    Called on sign-in and when the panel asks for the account, so a mailbox whose first attempt
    timed out finishes itself. Idempotent on the Eyemail side: an existing mailbox answers
    `exists`, which counts as done. Never raises - a failure only leaves the flag false.
    """
    if state.get("mailbox_ready"):
        return state
    user_id = str(state.get("user_id") or "")
    address = str(state.get("eyemail_id") or "")
    username = address.split("@")[0] if "@" in address else address
    if not user_id or not username:
        return state
    try:
        email_sender.register_mailbox(
            user_id=user_id,
            username=username,
            name=str(state.get("full_name") or ""),
            recovery_email=str(state.get("secondary_email") or ""),
        )
    except (EmailConfigurationError, EmailDeliveryError):
        logger.warning("mailbox still pending user=%s", user_id)
        return state
    try:
        repository.set_mailbox_ready(user_id)
    except Exception:
        logger.exception("could not record the mailbox state user=%s", user_id)
        return state
    logger.info("mailbox finished on retry user=%s", user_id)
    state = dict(state)
    state["mailbox_ready"] = True
    return state


def delete_eyemail_mailbox(user_id: str) -> None:
    """Remove the mailbox when the account goes. Never blocks the deletion."""
    try:
        email_sender.delete_mailbox(user_id)
        logger.info("mailbox deleted user=%s", user_id)
    except (EmailConfigurationError, EmailDeliveryError):
        logger.exception("mailbox deletion failed user=%s", user_id)


def rename_eyemail_mailbox(user_id: str, name: str) -> None:
    """Keep the display name in step. Cosmetic, so it never blocks the profile update."""
    if not name:
        return
    try:
        email_sender.rename_mailbox(user_id, name)
        logger.info("mailbox renamed user=%s", user_id)
    except (EmailConfigurationError, EmailDeliveryError):
        logger.exception("mailbox rename failed user=%s", user_id)


def send_account_alert(
    state: dict[str, Any],
    *,
    subject: str,
    heading: str,
    message: str,
    preference: str | None = "account",
) -> None:
    notifications = state.get("notifications") or {}
    # The mailbox is the person's real address now, so ordinary alerts go there. The recovery
    # address is only a fallback for accounts whose mailbox does not exist yet.
    mailbox = str(state.get("eyemail_id") or "").strip().lower()
    recovery = str(state.get("secondary_email") or "").strip().lower()
    if mailbox:
        destination = mailbox
    elif recovery and state.get("secondary_email_verified"):
        destination = recovery
    else:
        destination = ""
    wanted = preference or "account"
    # One line per decision, so CloudWatch can answer "did a mail go out, and why not"
    # without guessing. Only failures used to be logged, which made a quiet log look like
    # proof that nothing was sent.
    if not destination:
        logger.info("alert skipped preference=%s reason=no_destination", wanted)
        return
    # Nothing is sent unless the user turned that notification on. Verification codes
    # (OTP) are a separate path and are unaffected by these preferences.
    if not notifications.get("security", False):
        logger.info("alert skipped preference=%s reason=security_off", wanted)
        return
    if not notifications.get(wanted, False):
        logger.info("alert skipped preference=%s reason=preference_off", wanted)
        return
    try:
        email_sender.send_account_alert(
            destination,
            subject=subject,
            heading=heading,
            message=message,
        )
        logger.info("alert sent preference=%s", wanted)
    except (EmailConfigurationError, EmailDeliveryError):
        logger.exception("Account action succeeded but its notification email failed")


def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in is required.")
    return authorization.removeprefix("Bearer ").strip()


def current_user(token: Annotated[str, Depends(bearer_token)]) -> str:
    try:
        return repository.user_from_token(token)
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error


def panel_identity(token: Annotated[str, Depends(bearer_token)]) -> tuple[str, str | None]:
    """An account session, or an app token that may only open its own app's panel."""
    if token.count(".") == 2:
        try:
            user_id, app, _session_id = repository.user_from_app_token(token)
        except AuthenticationError as error:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
        return user_id, app
    try:
        return repository.user_from_token(token), None
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error


def scoped_user(app: str, identity: tuple[str, str | None]) -> str:
    user_id, token_app = identity
    if token_app is not None and token_app != app:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This app session can only open its own panel.",
        )
    return user_id


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, error: RequestValidationError):
    errors = error.errors()
    malformed_json = any(item.get("type") == "json_invalid" for item in errors)
    if malformed_json:
        return JSONResponse(status_code=400, content={"detail": "Request body is not valid JSON."})
    sanitized = [
        {
            "loc": list(item.get("loc", ())),
            "msg": item.get("msg", "Invalid value."),
            "type": item.get("type", "value_error"),
        }
        for item in errors
    ]
    return JSONResponse(status_code=422, content={"detail": sanitized})


@app.exception_handler(ConflictError)
async def conflict_handler(_request, error: ConflictError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.exception_handler(NotFoundError)
async def not_found_handler(_request, error: NotFoundError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(OtpRateLimitError)
async def otp_rate_limit_handler(request: Request, error: OtpRateLimitError):
    from fastapi.responses import JSONResponse
    logger.warning(
        "OTP request rate limited path=%s retry_after=%s",
        request.url.path,
        error.retry_after,
    )
    return JSONResponse(
        status_code=429,
        content={"detail": str(error), "retry_after": error.retry_after},
        headers={"Retry-After": str(error.retry_after)},
    )


@app.exception_handler(RequestRateLimitError)
async def request_rate_limit_handler(request: Request, error: RequestRateLimitError):
    logger.warning(
        "Request rate limited path=%s retry_after=%s",
        request.url.path,
        error.retry_after,
    )
    return JSONResponse(
        status_code=429,
        content={"detail": str(error), "retry_after": error.retry_after},
        headers={"Retry-After": str(error.retry_after)},
    )


@app.exception_handler(OtpError)
async def otp_handler(_request, error: OtpError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": str(error)})


@app.exception_handler(EmailConfigurationError)
async def email_configuration_handler(_request, error: EmailConfigurationError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(EmailDeliveryError)
async def email_delivery_handler(_request, error: EmailDeliveryError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(PayloadTooLargeError)
async def payload_too_large_handler(_request, error: PayloadTooLargeError):
    return JSONResponse(status_code=413, content={"detail": str(error)})


@app.exception_handler(AppPausedError)
async def app_paused_handler(_request, error: AppPausedError):
    return JSONResponse(status_code=403, content={"detail": str(error)})


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def app_session(authorization: Annotated[str | None, Header()] = None) -> tuple[str, str, str]:
    credential = bearer_token(authorization)
    try:
        return repository.user_from_app_token(credential)
    except AuthenticationError as error:
        if credential.count(".") == 1:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This endpoint requires an app session, not an account session.",
            ) from error
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error


def enforce_app_rate_limit(request: Request, user_id: str, app: str, *, write: bool) -> None:
    repository.enforce_public_request_limits(
        "app_write" if write else "app_read",
        f"{app}:{user_id}",
        request_client_ip(request),
        now=int(time.time()),
        window_seconds=settings.app_request_window_seconds,
        subject_limit=settings.app_write_limit if write else settings.app_request_limit,
        ip_limit=max(settings.app_request_limit * 3, 120),
    )


@app.get("/health")
def health() -> dict[str, Any]:
    details = repository.table_status()
    return {
        "service": "indo-account-api",
        "version": app.version,
        "ok": details["status"] == "ACTIVE",
        "dynamodb": details,
    }


def request_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def enforce_otp_request_limits(request: Request, flow: str, subject: str) -> None:
    repository.enforce_otp_request_limits(
        flow,
        subject.strip().lower(),
        request_client_ip(request),
        now=int(time.time()),
        short_window_seconds=settings.otp_rate_window_seconds,
        target_short_limit=settings.otp_target_window_limit,
        target_daily_limit=settings.otp_target_daily_limit,
        ip_short_limit=settings.otp_ip_window_limit,
        ip_daily_limit=settings.otp_ip_daily_limit,
    )


@app.post("/api/v1/auth/email-otp/request", status_code=202)
def request_email_otp(payload: EmailOtpRequest, request: Request) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    email = str(payload.email).strip().lower()
    enforce_otp_request_limits(request, "signup", email)
    if repository.email_registered(email):
        raise ConflictError("This recovery email is already registered.")

    code = new_otp_code()
    code_hash = otp_digest(email, code, settings.otp_hash_secret)
    now = int(time.time())
    repository.store_signup_otp(
        email,
        code_hash,
        expires_at=now + settings.otp_ttl_seconds,
        resend_after=now + settings.otp_resend_seconds,
    )
    try:
        email_sender.send_signup_otp(email, code)
    except (EmailConfigurationError, EmailDeliveryError):
        repository.discard_signup_otp(email, code_hash)
        raise
    return {
        "message": "Verification code sent.",
        "expires_in": settings.otp_ttl_seconds,
        "resend_after": settings.otp_resend_seconds,
    }


@app.post("/api/v1/auth/indo-id/availability")
def indo_id_availability(payload: IndoIdAvailabilityRequest, request: Request) -> dict[str, Any]:
    handle = payload.handle
    repository.enforce_public_request_limits(
        "indo_id_availability",
        handle,
        request_client_ip(request),
        now=int(time.time()),
        window_seconds=settings.id_rate_window_seconds,
        subject_limit=settings.id_rate_target_limit,
        ip_limit=settings.id_rate_ip_limit,
    )
    return {
        "handle": handle,
        "indo_id": f"{handle}@eyemail.in",
        "available": repository.indo_id_available(handle),
    }


@app.post("/api/v1/auth/email-otp/verify")
def verify_email_otp(payload: EmailOtpVerify) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    email = str(payload.email).strip().lower()
    code_hash = otp_digest(email, payload.code, settings.otp_hash_secret)
    verification_token = repository.verify_signup_otp(email, code_hash)
    return {
        "verification_token": verification_token,
        "expires_in": settings.otp_verification_seconds,
    }


@app.post("/api/v1/auth/signup", status_code=201)
def signup(payload: SignupRequest) -> dict[str, Any]:
    profile, token = repository.create_account(
        payload.model_dump(),
        require_email_verification=settings.require_signup_email_otp,
    )
    try:
        register_eyemail_mailbox(profile)
    except (EmailConfigurationError, EmailDeliveryError):
        # The account is kept, not deleted. A mailbox may exist on the Eyemail side even when
        # the answer never arrived, and deleting the account would strand that mailbox and keep
        # the name taken. The mailbox finishes itself on the next sign-in instead.
        logger.exception("mailbox pending after signup user=%s", profile.get("user_id"))
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Your account was created and your mailbox is being set up. "
            "Please sign in again in a minute.",
        ) from None
    try:
        repository.set_mailbox_ready(str(profile.get("user_id") or ""))
        profile = dict(profile)
        profile["mailbox_ready"] = True
    except Exception:
        logger.exception("could not record the mailbox state user=%s", profile.get("user_id"))
    return {"token": token, "profile": profile}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest, request: Request) -> dict[str, Any]:
    try:
        profile, token = repository.authenticate(
            payload.identifier,
            payload.password,
            payload.device,
            client_ip=request_client_ip(request),
            rate_window_seconds=settings.login_rate_window_seconds,
            account_failure_limit=settings.login_account_failure_limit,
            ip_failure_limit=settings.login_ip_failure_limit,
        )
        profile = finish_pending_mailbox(profile)
        send_account_alert(
            profile,
            subject="New sign-in to your Indo Account",
            heading="New sign-in detected",
            message=f"Your Indo Account was signed in on {payload.device}.",
            preference="signin",
        )
        return {"token": token, "profile": profile}
    except AuthenticationRateLimitError as error:
        if error.newly_blocked and error.user_id:
            try:
                send_account_alert(
                    repository.get_account_state(error.user_id),
                    subject="Suspicious sign-in attempts were blocked",
                    heading="Sign-in attempts blocked",
                    message="Repeated unsuccessful sign-in attempts against your Indo Account were temporarily blocked.",
                    preference=None,
                )
            except (NotFoundError, AuthenticationError):
                logger.exception("Could not send the sign-in protection alert")
        raise
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error


def password_reset_request_response(*, resend_after: int | None = None) -> dict[str, Any]:
    return {
        "message": "If the account is registered, a verification code was sent to its recovery email.",
        "expires_in": settings.otp_ttl_seconds,
        "resend_after": resend_after or settings.otp_resend_seconds,
    }


@app.post("/api/v1/auth/password-reset/request", status_code=202)
def request_password_reset(payload: PasswordResetRequest, request: Request) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")

    target = repository.password_reset_target(payload.identifier)
    rate_subject = target[0] if target else payload.identifier.strip().lower()
    try:
        enforce_otp_request_limits(request, "password_reset", rate_subject)
    except OtpRateLimitError as error:
        return password_reset_request_response(resend_after=error.retry_after)
    if not target:
        # Keep the public response identical so account existence is not disclosed.
        challenge_digest(
            "password_reset",
            payload.identifier.strip().lower(),
            new_otp_code(),
            settings.otp_hash_secret,
        )
        return password_reset_request_response()

    user_id, email = target
    code = new_otp_code()
    code_hash = challenge_digest("password_reset", user_id, code, settings.otp_hash_secret)
    now = int(time.time())
    try:
        repository.store_password_reset_otp(
            user_id,
            email,
            code_hash,
            expires_at=now + settings.otp_ttl_seconds,
            resend_after=now + settings.otp_resend_seconds,
        )
    except OtpRateLimitError as error:
        return password_reset_request_response(resend_after=error.retry_after)

    try:
        email_sender.send_password_reset_otp(email, code)
    except (EmailConfigurationError, EmailDeliveryError):
        repository.discard_password_reset_otp(user_id, code_hash)
        return password_reset_request_response()
    return password_reset_request_response()


@app.post("/api/v1/auth/password-reset/verify")
def verify_password_reset(payload: PasswordResetVerify) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    target = repository.password_reset_target(payload.identifier)
    if not target:
        raise OtpError("This verification code has expired. Request a new code.")
    user_id, _email = target
    code_hash = challenge_digest("password_reset", user_id, payload.code, settings.otp_hash_secret)
    reset_token = repository.verify_password_reset_otp(user_id, code_hash)
    return {"reset_token": reset_token, "expires_in": settings.otp_verification_seconds}


@app.post(
    "/api/v1/auth/password-reset/complete",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def complete_password_reset(payload: PasswordResetComplete) -> Response:
    user_id = repository.complete_password_reset(payload.reset_token, payload.new_password)
    send_account_alert(
        repository.get_account_state(user_id),
        subject="Your Indo Account password was reset",
        heading="Password reset completed",
        message="Your password was reset using recovery email verification. All active device sessions were signed out.",
        preference=None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(token: Annotated[str, Depends(bearer_token)]) -> Response:
    try:
        user_id = repository.user_from_token(token)
        repository.record_security_event(user_id, "signout", "Signed out", "An Indo Account browser session was signed out.")
    except AuthenticationError:
        pass
    repository.revoke_token(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/me")
def me(token: Annotated[str, Depends(bearer_token)]) -> dict[str, Any]:
    try:
        user_id = repository.user_from_token(token)
        state = repository.get_account_state(user_id, current_token=token)
        return finish_pending_mailbox(state)
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
    except NotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error


@app.get("/api/v1/me/mail-session")
def mail_session(user_id: Annotated[str, Depends(current_user)]) -> dict[str, str]:
    """Give the panel a one-time link that opens this person's mailbox.

    The link carries a short-lived Firebase token in its fragment, minted only when the person
    clicks, and it is never logged here.
    """
    try:
        result = email_sender.mail_session(user_id)
    except EmailConfigurationError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Mail is not configured yet.") from error
    except EmailDeliveryError as error:
        # Eyemail answers 404 for a missing mailbox and 409 for a mailbox with no login record.
        if getattr(error, "status", None) in (404, 409):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Your mailbox is still being set up. Try again in a minute.",
            ) from error
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Your mailbox could not be opened right now. Try again in a minute.",
        ) from error
    url = str(result.get("url") or "")
    if not url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Mail is not configured yet.")
    logger.info("mail session issued user=%s", user_id)
    return {"url": url}


@app.patch("/api/v1/me")
def update_me(payload: ProfileUpdate, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    changes = payload.model_dump(exclude_none=True)
    state = repository.update_profile(user_id, changes)
    if "full_name" in changes:
        rename_eyemail_mailbox(user_id, str(state.get("full_name") or ""))
    if changes:
        send_account_alert(
            state,
            subject="Your Indo Account profile changed",
            heading="Personal information updated",
            message="Personal information in your Indo Account was updated.",
            preference="account",
        )
    return state


@app.post("/api/v1/me/recovery-email/request", status_code=202)
def request_recovery_email_otp(
    payload: RecoveryEmailOtpRequest,
    request: Request,
    user_id: Annotated[str, Depends(current_user)],
) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    email = repository.recovery_email_target(user_id, str(payload.email))
    enforce_otp_request_limits(request, "recovery_email", user_id)
    code = new_otp_code()
    code_hash = challenge_digest("recovery_email", f"{user_id}:{email}", code, settings.otp_hash_secret)
    now = int(time.time())
    repository.store_recovery_email_otp(
        user_id,
        email,
        code_hash,
        expires_at=now + settings.otp_ttl_seconds,
        resend_after=now + settings.otp_resend_seconds,
    )
    try:
        email_sender.send_recovery_email_otp(email, code)
    except (EmailConfigurationError, EmailDeliveryError):
        repository.discard_recovery_email_otp(user_id, code_hash)
        raise
    return {
        "message": "Verification code sent.",
        "expires_in": settings.otp_ttl_seconds,
        "resend_after": settings.otp_resend_seconds,
    }


@app.post("/api/v1/me/recovery-email/verify")
def verify_recovery_email_otp(
    payload: RecoveryEmailOtpVerify,
    user_id: Annotated[str, Depends(current_user)],
    token: Annotated[str, Depends(bearer_token)],
) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    email = str(payload.email).strip().lower()
    code_hash = challenge_digest(
        "recovery_email",
        f"{user_id}:{email}",
        payload.code,
        settings.otp_hash_secret,
    )
    previous = repository.get_account_state(user_id)
    state = repository.verify_recovery_email_otp(user_id, email, code_hash)
    # The recovery email is the other way into the account, so the same rule applies.
    try:
        keep = repository.current_session_id(user_id, token)
    except AuthenticationError:
        keep = None
    repository.revoke_all_sessions(user_id, keep_session_id=keep)
    send_account_alert(
        previous,
        subject="Your Indo Account recovery email changed",
        heading="Recovery email changed",
        message=f"The recovery email on your Indo Account was changed to {email}.",
        preference=None,
    )
    send_account_alert(
        state,
        subject="Your Indo Account recovery email changed",
        heading="Recovery email updated",
        message="Your recovery email was verified and updated successfully.",
        preference="account",
    )
    return state


@app.post("/api/v1/me/security-otp/request", status_code=202)
def request_security_otp(
    payload: SecurityOtpRequest,
    request: Request,
    user_id: Annotated[str, Depends(current_user)],
) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    enforce_otp_request_limits(request, "security_action", user_id)
    email = repository.security_otp_target(user_id)
    code = new_otp_code()
    code_hash = challenge_digest(
        "security_action",
        f"{user_id}:{payload.action}",
        code,
        settings.otp_hash_secret,
    )
    now = int(time.time())
    repository.store_security_otp(
        user_id,
        payload.action,
        email,
        code_hash,
        expires_at=now + settings.otp_ttl_seconds,
        resend_after=now + settings.otp_resend_seconds,
    )
    try:
        email_sender.send_security_action_otp(
            email,
            code,
            SECURITY_ACTION_LABELS[payload.action],
        )
    except (EmailConfigurationError, EmailDeliveryError):
        repository.discard_security_otp(user_id, payload.action, code_hash)
        raise
    return {
        "message": "Security verification code sent.",
        "expires_in": settings.otp_ttl_seconds,
        "resend_after": settings.otp_resend_seconds,
    }


@app.post("/api/v1/me/security-otp/verify")
def verify_security_otp(
    payload: SecurityOtpVerify,
    user_id: Annotated[str, Depends(current_user)],
) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    code_hash = challenge_digest(
        "security_action",
        f"{user_id}:{payload.action}",
        payload.code,
        settings.otp_hash_secret,
    )
    verification_token = repository.verify_security_otp(user_id, payload.action, code_hash)
    return {
        "verification_token": verification_token,
        "expires_in": settings.otp_verification_seconds,
    }


@app.patch("/api/v1/me/state")
def sync_me(payload: AccountStateSync, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    return repository.sync_account_state(user_id, payload.model_dump(exclude_none=True))


@app.patch("/api/v1/me/two-step")
def update_two_step(payload: TwoStepUpdate, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    state = repository.set_two_step(
        user_id,
        payload.enabled,
        verification_token=payload.verification_token,
        require_verification=settings.require_sensitive_action_otp,
    )
    send_account_alert(
        state,
        subject="Indo Account two-step protection changed",
        heading=f"Two-step protection turned {'on' if payload.enabled else 'off'}",
        message=f"Recovery email OTP protection was turned {'on' if payload.enabled else 'off'} for your Indo Account.",
        preference=None,
    )
    return state


@app.post("/api/v1/me/password", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def change_password(
    payload: PasswordChange,
    user_id: Annotated[str, Depends(current_user)],
    token: Annotated[str, Depends(bearer_token)],
) -> Response:
    try:
        repository.change_password(
            user_id,
            payload.current_password,
            payload.new_password,
            verification_token=payload.verification_token,
            require_verification=settings.require_sensitive_action_otp,
        )
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    # A new password must not leave old sessions alive: a stolen device keeps its
    # token otherwise. The device that made the change stays signed in.
    try:
        keep = repository.current_session_id(user_id, token)
    except AuthenticationError:
        keep = None
    repository.revoke_all_sessions(user_id, keep_session_id=keep)
    send_account_alert(
        repository.get_account_state(user_id),
        subject="Your Indo Account password changed",
        heading="Password changed",
        message="Your Indo Account password was updated successfully.",
        preference=None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/me/export")
def export_me(payload: AccountExport, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    exported = repository.export_account_data(user_id, payload.verification_token)
    send_account_alert(
        repository.get_account_state(user_id),
        subject="Your Indo Account data was downloaded",
        heading="Account data downloaded",
        message="A secure JSON copy of your Indo Account data was downloaded.",
        preference=None,
    )
    return exported


@app.post("/api/v1/me/support", status_code=201)
def create_support_request(
    payload: SupportRequest,
    user_id: Annotated[str, Depends(current_user)],
) -> dict[str, str]:
    state = repository.get_account_state(user_id)
    if not settings.support_to_email:
        raise EmailConfigurationError("Support requests are not configured yet.")
    reference = f"INDO-{time.strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    email_sender.send_support_request(
        settings.support_to_email,
        reference=reference,
        user_name=str(state.get("full_name") or "Indo Account user"),
        user_email=str(state.get("secondary_email") or ""),
        user_id=user_id,
        category=payload.category,
        message=payload.message.strip(),
    )
    repository.record_security_event(
        user_id,
        "support",
        "Support request submitted",
        f"Support request {reference} was submitted under {payload.category}.",
    )
    try:
        email_sender.send_support_confirmation(str(state.get("secondary_email") or ""), reference=reference)
    except (EmailConfigurationError, EmailDeliveryError):
        logger.exception("Support request succeeded but confirmation email failed")
    return {"reference": reference, "message": "Your support request was sent."}


@app.delete("/api/v1/me/security-events")
def delete_security_events(
    user_id: Annotated[str, Depends(current_user)],
    payload: SecurityEventDelete | None = None,
) -> dict[str, int]:
    ids = payload.ids if payload else None
    # Removed means removed: nothing is written back, so the entry is gone from the
    # table and from every list that reads it, including the data export.
    return {"removed": repository.delete_security_events(user_id, ids)}


@app.delete(
    "/api/v1/me/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def sign_out_session(
    session_id: str,
    user_id: Annotated[str, Depends(current_user)],
) -> Response:
    try:
        repository.revoke_session(user_id, session_id)
    except NotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error
    send_account_alert(
        repository.get_account_state(user_id),
        subject="A device was signed out of your Indo Account",
        heading="Device signed out",
        message="An active device session was removed from your Indo Account.",
        preference="signin",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/api/v1/me/sessions")
def sign_out_sessions(
    include_current: bool,
    token: Annotated[str, Depends(bearer_token)],
) -> dict[str, int]:
    try:
        user_id = repository.user_from_token(token)
        removed = repository.revoke_sessions(
            user_id,
            current_token=token,
            include_current=include_current,
        )
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
    if removed:
        send_account_alert(
            repository.get_account_state(user_id),
            subject="Devices were signed out of your Indo Account",
            heading="Device sessions removed",
            message=f"{removed} active device session{'s were' if removed != 1 else ' was'} removed from your Indo Account.",
            preference="signin",
        )
    return {"removed": removed}


@app.delete(
    "/api/v1/me",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_me(
    user_id: Annotated[str, Depends(current_user)],
    payload: AccountDelete | None = None,
) -> Response:
    state = repository.get_account_state(user_id)
    repository.delete_account(
        user_id,
        verification_token=payload.verification_token if payload else None,
        require_verification=settings.require_account_delete_otp,
    )
    delete_eyemail_mailbox(user_id)
    send_account_alert(
        state,
        subject="Your Indo Account was deleted",
        heading="Account deleted",
        message="Your Indo Account, sessions, lookup records, and account data were permanently deleted.",
        preference=None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# App data — panel surface (authenticated with the account session)
# ---------------------------------------------------------------------------


@app.get("/api/v1/me/apps")
def list_apps(user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    return {"apps": repository.list_app_boxes(user_id)}


@app.get("/api/v1/me/apps/{app}")
def get_app_box(app: AppKey, identity: Annotated[tuple[str, str | None], Depends(panel_identity)]) -> dict[str, Any]:
    return repository.get_app_box(scoped_user(app, identity), app)


@app.patch("/api/v1/me/apps/{app}")
def update_app_status(
    app: AppKey,
    payload: AppStatusUpdate,
    identity: Annotated[tuple[str, str | None], Depends(panel_identity)],
) -> dict[str, Any]:
    return repository.set_app_status(scoped_user(app, identity), app, payload.status)


@app.post("/api/v1/me/apps/{app}/authorize", status_code=201)
def authorize_app(
    app: AppKey,
    payload: AppAuthorizeRequest,
    user_id: Annotated[str, Depends(current_user)],
) -> dict[str, Any]:
    client = APP_CLIENTS[app]
    if not payload.redirect.startswith(client["redirect_prefixes"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That redirect address is not registered for this app.")
    code = new_verification_token()
    repository.create_app_code(user_id, app, token_digest(code), payload.code_challenge)
    separator = "&" if "?" in payload.redirect else "?"
    return {
        "redirect_url": f"{payload.redirect}{separator}code={quote(code)}&state={quote(payload.state)}",
        "expires_in": settings.app_code_seconds,
        "app": {"key": app, "name": client["name"]},
    }


@app.delete(
    "/api/v1/me/apps/{app}/sessions",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def revoke_app_access(app: AppKey, identity: Annotated[tuple[str, str | None], Depends(panel_identity)]) -> Response:
    repository.revoke_app_sessions(scoped_user(app, identity), app)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete(
    "/api/v1/me/apps/{app}/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def revoke_one_app_session(
    app: AppKey,
    session_id: str,
    identity: Annotated[tuple[str, str | None], Depends(panel_identity)],
) -> Response:
    repository.revoke_app_sessions(scoped_user(app, identity), app, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/api/v1/me/apps/{app}/history")
def clear_app_history_box(app: AppKey, identity: Annotated[tuple[str, str | None], Depends(panel_identity)]) -> dict[str, Any]:
    return repository.clear_app_history(scoped_user(app, identity), app)


@app.delete("/api/v1/me/apps/{app}/data")
def clear_app_box(app: AppKey, identity: Annotated[tuple[str, str | None], Depends(panel_identity)]) -> dict[str, Any]:
    return repository.clear_app_data(scoped_user(app, identity), app)


@app.get("/api/v1/me/apps/{app}/export")
def export_app_box(app: AppKey, identity: Annotated[tuple[str, str | None], Depends(panel_identity)]) -> dict[str, Any]:
    return repository.export_app_box(scoped_user(app, identity), app)


# ---------------------------------------------------------------------------
# App data — app surface (authenticated with an app-scoped token)
#
# The app key comes from the token itself, never from the path, so an app
# cannot even name another app's box.
# ---------------------------------------------------------------------------


def identity_block(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": state.get("user_id"),
        "indo_id": state.get("eyemail_id"),
        "full_name": state.get("full_name"),
        "nickname": state.get("nickname"),
        "language": state.get("language"),
    }


@app.post("/api/v1/app/session", status_code=201)
def exchange_app_code(payload: AppSessionExchange, request: Request) -> dict[str, Any]:
    repository.enforce_public_request_limits(
        "app_session",
        payload.app,
        request_client_ip(request),
        now=int(time.time()),
        window_seconds=settings.otp_rate_window_seconds,
        subject_limit=settings.otp_target_window_limit * 4,
        ip_limit=settings.otp_ip_window_limit * 2,
    )
    record = repository.consume_app_code(payload.app, token_digest(payload.code))
    if not hmac.compare_digest(str(record.get("code_challenge", "")), pkce_challenge(payload.code_verifier)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This sign-in request could not be verified.")
    user_id = str(record["user_id"])
    issued = repository.issue_app_token(user_id, payload.app, payload.device)
    state = repository.get_account_state(user_id)
    return {
        "token": issued["token"],
        "expires_in": issued["expires_in"],
        "session_id": issued["session_id"],
        "app": {"key": payload.app, "name": APP_CLIENTS[payload.app]["name"]},
        "identity": identity_block(state),
    }


@app.post("/api/v1/app/panel-session", status_code=201)
def create_panel_session(
    payload: PanelSessionRequest,
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    """Trade an app token for a short-lived account session.

    The app never holds an account session; it asks for one of these each time the user
    taps Manage, and the panel throws it away when the WebView closes.
    """
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=False)
    device = repository.clean_text(f"{APP_CLIENTS[app]['name']} panel on {payload.device}", 120)
    token = repository.create_bearer_session(
        user_id,
        device,
        ttl_seconds=settings.panel_session_seconds,
    )
    repository.record_security_event(
        user_id,
        "app.panel",
        f"{APP_CLIENTS[app]['name']} opened the account panel",
        f"The management panel was opened from {APP_CLIENTS[app]['name']} on {payload.device}.",
    )
    return {"panel_token": token, "expires_in": settings.panel_session_seconds}


@app.get("/api/v1/app/me")
def app_me(
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=False)
    return identity_block(repository.get_account_state(user_id))


@app.get("/api/v1/app/state")
def app_state(
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=False)
    box = repository.get_app_box(user_id, app)
    return {
        "key": box["key"],
        "name": box["name"],
        "status": box["status"],
        "connected": box["connected"],
        "connected_at": box.get("connected_at"),
        "last_used_at": box.get("last_used_at"),
        "preferences": box.get("preferences", {}),
        "counts": box["counts"],
    }


@app.patch("/api/v1/app/preferences")
def app_preferences(
    payload: AppPreferencesUpdate,
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=True)
    return repository.update_app_preferences(user_id, app, payload.preferences)


@app.get("/api/v1/app/saved")
def app_saved(
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
    limit: int = 50,
    cursor: str | None = None,
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=False)
    return repository.list_app_saved(user_id, app, limit=limit, cursor=cursor)


@app.post("/api/v1/app/saved", status_code=201)
def app_add_saved(
    payload: AppSavedCreate,
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=True)
    return repository.add_app_saved(user_id, app, payload.title, payload.url)


@app.delete("/api/v1/app/saved/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def app_delete_saved(
    item_id: str,
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> Response:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=True)
    repository.delete_app_saved(user_id, app, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/app/history")
def app_history(
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
    limit: int = 50,
    cursor: str | None = None,
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=False)
    return repository.list_app_history(user_id, app, limit=limit, cursor=cursor)


@app.post("/api/v1/app/history", status_code=202)
def app_add_history(
    payload: AppHistoryBatch,
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=True)
    return repository.add_app_history(user_id, app, [entry.model_dump() for entry in payload.entries])


@app.delete("/api/v1/app/history")
def app_clear_history(
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=True)
    return repository.clear_app_history(user_id, app)


@app.delete("/api/v1/app/data")
def app_clear_data(
    request: Request,
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> dict[str, Any]:
    user_id, app, _session_id = session
    enforce_app_rate_limit(request, user_id, app, write=True)
    return repository.clear_app_data(user_id, app)


@app.post("/api/v1/app/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def app_logout(
    session: Annotated[tuple[str, str, str], Depends(app_session)],
) -> Response:
    user_id, app, session_id = session
    repository.revoke_app_sessions(user_id, app, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


handler = Mangum(app, lifespan="off")
