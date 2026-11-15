from __future__ import annotations

import logging
import re
import time
from typing import Annotated, Any, Literal
from uuid import uuid4

import boto3
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from mangum import Mangum
from pydantic import BaseModel, EmailStr, Field, field_validator

from .config import settings
from .emailer import EmailConfigurationError, EmailDeliveryError, SesEmailSender
from .repository import (
    AuthenticationError,
    ConflictError,
    DynamoAccountRepository,
    NotFoundError,
    OtpError,
    OtpRateLimitError,
)
from .security import challenge_digest, new_otp_code, otp_digest


def build_repository() -> DynamoAccountRepository:
    resource = boto3.resource("dynamodb", region_name=settings.aws_region)
    return DynamoAccountRepository(
        resource.Table(settings.table_name),
        session_days=settings.session_days,
        otp_max_attempts=settings.otp_max_attempts,
        otp_verification_seconds=settings.otp_verification_seconds,
    )


repository = build_repository()
email_sender = SesEmailSender(
    boto3.client("sesv2", region_name=settings.aws_region),
    from_email=settings.otp_from_email,
)
logger = logging.getLogger(__name__)
app = FastAPI(title="Indo Account API", version="0.9.0", docs_url=None, redoc_url=None)


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


SECURITY_ACTION_LABELS = {
    "change_password": "changing your password",
    "disable_two_step": "turning off two-step protection",
    "delete_account": "permanently deleting your Indo Account",
    "export_data": "downloading a copy of your Indo Account data",
}


def send_account_alert(
    state: dict[str, Any],
    *,
    subject: str,
    heading: str,
    message: str,
    preference: str | None = "account",
) -> None:
    notifications = state.get("notifications") or {}
    destination = str(state.get("secondary_email") or "").strip().lower()
    if not destination or not state.get("secondary_email_verified") or not notifications.get("security", True):
        return
    if preference and not notifications.get(preference, True):
        return
    try:
        email_sender.send_account_alert(
            destination,
            subject=subject,
            heading=heading,
            message=message,
        )
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


@app.get("/health")
def health() -> dict[str, Any]:
    details = repository.table_status()
    return {
        "service": "indo-account-api",
        "version": app.version,
        "ok": details["status"] == "ACTIVE",
        "dynamodb": details,
    }


def enforce_otp_request_limits(request: Request, flow: str, subject: str) -> None:
    client_ip = request.client.host if request.client else "unknown"
    repository.enforce_otp_request_limits(
        flow,
        subject.strip().lower(),
        client_ip,
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
def indo_id_availability(payload: IndoIdAvailabilityRequest) -> dict[str, Any]:
    handle = payload.handle
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
    return {"token": token, "profile": profile}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest) -> dict[str, Any]:
    try:
        profile, token = repository.authenticate(payload.identifier, payload.password, payload.device)
        send_account_alert(
            profile,
            subject="New sign-in to your Indo Account",
            heading="New sign-in detected",
            message=f"Your Indo Account was signed in on {payload.device}.",
            preference="signin",
        )
        return {"token": token, "profile": profile}
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
        return repository.get_account_state(user_id, current_token=token)
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error
    except NotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error


@app.patch("/api/v1/me")
def update_me(payload: ProfileUpdate, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    changes = payload.model_dump(exclude_none=True)
    state = repository.update_profile(user_id, changes)
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
def change_password(payload: PasswordChange, user_id: Annotated[str, Depends(current_user)]) -> Response:
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
    send_account_alert(
        state,
        subject="Your Indo Account was deleted",
        heading="Account deleted",
        message="Your Indo Account, sessions, lookup records, and account data were permanently deleted.",
        preference=None,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


handler = Mangum(app, lifespan="off")

