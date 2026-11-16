"""Move history and saved entries out of the old app-box blob, once.

Usage, from the repository root, with AWS credentials in the environment:

    python -m backend.scripts.migrate_app_entries            # report only
    python -m backend.scripts.migrate_app_entries --apply    # do it

Safe to run again: a box that has nothing left inside is skipped, and entries already moved
are written from the blob only once because the blob is emptied in the same pass.
"""
from __future__ import annotations

import sys

from app.main import build_repository


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    repository = build_repository()
    result = repository.migrate_app_boxes(dry_run=not apply)
    mode = "moved" if apply else "would move"
    print(f"boxes with entries inside: {result['boxes']}")
    print(f"{mode} history entries: {result['history']}")
    print(f"{mode} saved entries: {result['saved']}")
    if not apply:
        print("nothing changed. Run again with --apply to do it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
