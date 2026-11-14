from __future__ import annotations

import os
from dataclasses import dataclass


def _origins() -> tuple[str, ...]:
    raw = os.getenv(
        "ALLOWED_ORIGINS",
        "https://indoworkspace.github.io,http://localhost:8000,http://127.0.0.1:8000",
    )
    return tuple(origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    table_name: str = os.getenv("DYNAMODB_TABLE", "UnifiedAppTable")
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")
    allowed_origins: tuple[str, ...] = _origins()
    session_days: int = int(os.getenv("SESSION_DAYS", "30"))


settings = Settings()

