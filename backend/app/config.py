from __future__ import annotations

import os
from dataclasses import dataclass


def _origins() -> tuple[str, ...]:
    raw = os.getenv(
        "ALLOWED_ORIGINS",
        "https://indoworkspace.github.io,http://localhost:8000,http://127.0.0.1:8000",
    )
    return tuple(origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip())


def _enabled(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    table_name: str = os.getenv("DYNAMODB_TABLE", "UnifiedAppTable")
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")
    allowed_origins: tuple[str, ...] = _origins()
    session_days: int = int(os.getenv("SESSION_DAYS", "30"))
    session_max_active: int = int(os.getenv("SESSION_MAX_ACTIVE", "10"))
    session_activity_update_seconds: int = int(os.getenv("SESSION_ACTIVITY_UPDATE_SECONDS", "300"))
    max_request_bytes: int = int(os.getenv("MAX_REQUEST_BYTES", "2621440"))
    otp_from_email: str = os.getenv("OTP_FROM_EMAIL", "no-reply@eyemail.in")
    support_to_email: str = os.getenv("SUPPORT_TO_EMAIL", "")
    otp_hash_secret: str = os.getenv("OTP_HASH_SECRET", "")
    otp_ttl_seconds: int = int(os.getenv("OTP_TTL_SECONDS", "600"))
    otp_resend_seconds: int = int(os.getenv("OTP_RESEND_SECONDS", "60"))
    otp_verification_seconds: int = int(os.getenv("OTP_VERIFICATION_SECONDS", "900"))
    otp_max_attempts: int = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
    otp_rate_window_seconds: int = int(os.getenv("OTP_RATE_WINDOW_SECONDS", "900"))
    otp_target_window_limit: int = int(os.getenv("OTP_TARGET_WINDOW_LIMIT", "3"))
    otp_target_daily_limit: int = int(os.getenv("OTP_TARGET_DAILY_LIMIT", "10"))
    otp_ip_window_limit: int = int(os.getenv("OTP_IP_WINDOW_LIMIT", "10"))
    otp_ip_daily_limit: int = int(os.getenv("OTP_IP_DAILY_LIMIT", "50"))
    login_rate_window_seconds: int = int(os.getenv("LOGIN_RATE_WINDOW_SECONDS", "900"))
    login_account_failure_limit: int = int(os.getenv("LOGIN_ACCOUNT_FAILURE_LIMIT", "5"))
    login_ip_failure_limit: int = int(os.getenv("LOGIN_IP_FAILURE_LIMIT", "20"))
    id_rate_window_seconds: int = int(os.getenv("ID_RATE_WINDOW_SECONDS", "60"))
    id_rate_target_limit: int = int(os.getenv("ID_RATE_TARGET_LIMIT", "10"))
    id_rate_ip_limit: int = int(os.getenv("ID_RATE_IP_LIMIT", "30"))
    panel_session_seconds: int = int(os.getenv("PANEL_SESSION_SECONDS", "900"))
    app_token_days: int = int(os.getenv("APP_TOKEN_DAYS", "30"))
    app_code_seconds: int = int(os.getenv("APP_CODE_SECONDS", "60"))
    app_history_limit: int = int(os.getenv("APP_HISTORY_LIMIT", "500"))
    app_saved_limit: int = int(os.getenv("APP_SAVED_LIMIT", "500"))
    app_box_max_bytes: int = int(os.getenv("APP_BOX_MAX_BYTES", str(200 * 1024)))
    app_max_sessions: int = int(os.getenv("APP_MAX_SESSIONS", "5"))
    app_request_window_seconds: int = int(os.getenv("APP_REQUEST_WINDOW_SECONDS", "60"))
    app_request_limit: int = int(os.getenv("APP_REQUEST_LIMIT", "120"))
    app_write_limit: int = int(os.getenv("APP_WRITE_LIMIT", "30"))
    require_signup_email_otp: bool = _enabled("REQUIRE_SIGNUP_EMAIL_OTP")
    require_sensitive_action_otp: bool = _enabled("REQUIRE_SENSITIVE_ACTION_OTP")
    require_account_delete_otp: bool = _enabled("REQUIRE_ACCOUNT_DELETE_OTP")


settings = Settings()

