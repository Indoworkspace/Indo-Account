from __future__ import annotations

from typing import Annotated, Any

import boto3
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, EmailStr, Field, field_validator

from .config import settings
from .repository import AuthenticationError, ConflictError, DynamoAccountRepository, NotFoundError


def build_repository() -> DynamoAccountRepository:
    resource = boto3.resource("dynamodb", region_name=settings.aws_region)
    return DynamoAccountRepository(resource.Table(settings.table_name), session_days=settings.session_days)


repository = build_repository()
app = FastAPI(title="Indo Account API", version="0.1.0", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    nickname: str = Field(min_length=2, max_length=30)
    handle: str = Field(min_length=6, max_length=30, pattern=r"^[a-z0-9._]+(?:@eyemail\.in)?$")
    secondary_email: EmailStr
    secondary_email_verified: bool = False
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


@app.get("/health")
def health() -> dict[str, Any]:
    details = repository.table_status()
    return {"service": "indo-account-api", "ok": details["status"] == "ACTIVE", "dynamodb": details}


@app.post("/api/v1/auth/signup", status_code=201)
def signup(payload: SignupRequest) -> dict[str, Any]:
    profile, token = repository.create_account(payload.model_dump())
    return {"token": token, "profile": profile}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest) -> dict[str, Any]:
    try:
        profile, token = repository.authenticate(payload.identifier, payload.password, payload.device)
        return {"token": token, "profile": profile}
    except AuthenticationError as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(error)) from error


@app.get("/api/v1/me")
def me(user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    try:
        return repository.get_profile(user_id)
    except NotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error


@app.patch("/api/v1/me")
def update_me(payload: ProfileUpdate, user_id: Annotated[str, Depends(current_user)]) -> dict[str, Any]:
    return repository.update_profile(user_id, payload.model_dump(exclude_none=True))


@app.delete("/api/v1/me", status_code=204)
def delete_me(user_id: Annotated[str, Depends(current_user)]) -> None:
    repository.delete_account(user_id)


handler = Mangum(app, lifespan="off")

