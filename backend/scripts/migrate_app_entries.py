"""Move history and saved entries out of the old app-box blob, once.

Usage, from the `backend/` directory, with AWS credentials in the environment:

    python -m scripts.migrate_app_entries            # report only
    python -m scripts.migrate_app_entries --apply    # do it

This deliberately imports only `app.config` and `app.repository`, not `app.main`, so it runs
without FastAPI or pydantic installed — the migration is a data job, not a web request.

Safe to run again: a box that has nothing left inside is skipped, and the blob is emptied in
the same pass the entries are written, so nothing is moved twice.
"""
from __future__ import annotations

import sys

import boto3

from app.config import settings
from app.repository import DynamoAccountRepository


def build() -> DynamoAccountRepository:
    table = boto3.resource("dynamodb", region_name=settings.aws_region).Table(settings.table_name)
    return DynamoAccountRepository(
        table,
        app_history_limit=settings.app_history_limit,
        app_saved_limit=settings.app_saved_limit,
    )


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    repository = build()
    result = repository.migrate_app_boxes(dry_run=not apply)
    mode = "moved" if apply else "would move"
    print(f"table: {settings.table_name} ({settings.aws_region})")
    print(f"boxes with entries inside: {result['boxes']}")
    print(f"{mode} history entries: {result['history']}")
    print(f"{mode} saved entries: {result['saved']}")
    if not apply:
        print("nothing changed. Run again with --apply to do it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
