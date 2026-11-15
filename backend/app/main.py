from __future__ import annotations

import time
from typing import Annotated, Any

import boto3
from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
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
from .security import new_otp_code, otp_digest


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
app = FastAPI(title="Indo Account API", version="0.2.0", docs_url=None, redoc_url=None)


class EmailOtpRequest(BaseModel):
    email: EmailStr


class EmailOtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    nickname: str = Field(min_length=2, max_length=30)
    handle: str = Field(min_length=6, max_length=30, pattern=r"^[a-z0-9._]+(?:@eyemail\.in)?$")
    secondary_email: EmailStr
    email_verification_token: str | None = Field(default=None, min_length=32, max_length=512)
    phone: str = Field(pattern=r"^(?:\+?91)?[6-9]\d{9}$")
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    language: str = Field(default="kn", pattern=r"^(kn|en|hi)$")
    gender: str | None = None
    password: str = Field(min_length=8, max_length=64)
    device: str = Field(default="Web browser", max_length=120)

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


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        tests = (any(c.islower() for c in value), any(c.isupper() for c in value), any(c.isdigit() for c in value), any(not c.isalnum() for c in value))
        if not all(tests):
            raise ValueError("Password must include uppercase, lowercase, number, and symbol.")
        return value


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


@app.exception_handler(OtpRateLimitError)
async def otp_rate_limit_handler(_request, error: OtpRateLimitError):
    from fastapi.responses import JSONResponse
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
    return {"service": "indo-account-api", "ok": details["status"] == "ACTIVE", "dynamodb": details}


@app.post("/api/v1/auth/email-otp/request", status_code=202)
def request_email_otp(payload: EmailOtpRequest) -> dict[str, Any]:
    if len(settings.otp_hash_secret) < 32:
        raise EmailConfigurationError("Email verification is not configured yet.")
    email = str(payload.email).strip().lower()
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
        return {"token": token, "profile": profile}
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error


@app.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(token: Annotated[str, Depends(bearer_token)]) -> Response:
    repository.revoke_token(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/me")
def me(user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    try:
        return repository.get_account_state(user_id)
    except NotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error


@app.patch("/api/v1/me")
def update_me(payload: ProfileUpdate, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    return repository.update_profile(user_id, payload.model_dump(exclude_none=True))


@app.patch("/api/v1/me/state")
def sync_me(payload: AccountStateSync, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    return repository.sync_account_state(user_id, payload.model_dump(exclude_none=True))


@app.patch("/api/v1/me/two-step")
def update_two_step(payload: TwoStepUpdate, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    return repository.set_two_step(user_id, payload.enabled)


@app.post("/api/v1/me/password", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def change_password(payload: PasswordChange, user_id: Annotated[str, Depends(current_user)]) -> Response:
    try:
        repository.change_password(user_id, payload.current_password, payload.new_password)
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(error)) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete(
    "/api/v1/me",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_me(user_id: Annotated[str, Depends(current_user)]) -> Response:
    repository.delete_account(user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


handler = Mangum(app, lifespan="off")

