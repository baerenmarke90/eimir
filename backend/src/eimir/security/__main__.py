"""Operator command line for encryption at rest.

    python -m eimir.security status
    python -m eimir.security migrate-payloads | rewrap-payloads | verify-payloads
    python -m eimir.security migrate-media    | rewrap-media    | verify-media

Runs with the same environment as the API (database URL, media store, keys). It
prints table names, counts, and key ids only. See docs/ENCRYPTION-AT-REST.md.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.media import EncryptingMediaStore, build_plain_media_store
from eimir.security import lifecycle
from eimir.security.errors import EncryptionError
from eimir.security.keyring import EncryptionMode
from eimir.security.runtime import key_ring_from_settings

COMMANDS = (
    "status",
    "migrate-payloads",
    "rewrap-payloads",
    "verify-payloads",
    "migrate-media",
    "rewrap-media",
    "verify-media",
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=COMMANDS)
    args = parser.parse_args(argv)

    settings = get_settings()
    engine = create_engine(settings.database_url, future=True)
    ring = key_ring_from_settings(settings)

    try:
        with Session(engine) as session:
            if args.command == "status":
                for report in lifecycle.payload_status(session):
                    print(
                        f"{report.table}: crypto_version={dict(report.by_crypto_version)} "
                        f"key_ids={dict(report.by_key_id)} inconsistent={report.inconsistent}"
                    )
                return 0

            if ring is None:
                print(
                    "Refused: key material is not configured "
                    "(EIMIR_ENCRYPTION_AT_REST, EIMIR_ENCRYPTION_KEYS, "
                    "EIMIR_ENCRYPTION_ACTIVE_KEY_ID).",
                    file=sys.stderr,
                )
                return 2

            if args.command.endswith("-payloads"):
                return _payloads(args.command, session, ring)
            store = EncryptingMediaStore(
                build_plain_media_store(settings), ring, EncryptionMode.MIGRATING
            )
            return _media(args.command, session, store)
    except EncryptionError as error:
        print(f"Failed: {error}", file=sys.stderr)
        return 1


def _payloads(command: str, session: Session, ring: object) -> int:
    from eimir.security.keyring import KeyWrapper

    wrapper: KeyWrapper = ring  # type: ignore[assignment]
    if command == "verify-payloads":
        report = lifecycle.verify_payloads(session, wrapper)
        print(f"checked={dict(report.checked)}")
        print(f"plaintext_remaining={dict(report.plaintext)}")
        print(f"unreadable={dict(report.unreadable)} inconsistent={dict(report.inconsistent)}")
        return 0 if report.ok else 1
    action = (
        lifecycle.migrate_payloads if command == "migrate-payloads" else lifecycle.rewrap_payloads
    )
    for table, result in action(session, wrapper).items():
        print(
            f"{table}: converted={result.converted} skipped_concurrent={result.skipped_concurrent}"
        )
    return 0


def _media(command: str, session: Session, store: EncryptingMediaStore) -> int:
    action = {
        "migrate-media": lifecycle.migrate_media,
        "rewrap-media": lifecycle.rewrap_media,
        "verify-media": lifecycle.verify_media,
    }[command]
    result = action(session, store)
    print(
        f"encrypted={result.encrypted} already_encrypted={result.already_encrypted} "
        f"rewrapped={result.rewrapped} current={result.current} "
        f"absent_homes={result.absent} unreadable={result.unreadable}"
    )
    return 1 if result.unreadable else 0


if __name__ == "__main__":
    raise SystemExit(main())
