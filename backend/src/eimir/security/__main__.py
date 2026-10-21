"""Operator command line for encryption at rest.

    python -m eimir.security status
    python -m eimir.security migrate-payloads | rewrap-payloads | verify-payloads
    python -m eimir.security migrate-media    | rewrap-media    | verify-media
    python -m eimir.security audit-raw [--media-sample N]

Runs with the same environment as the API (database URL, media store, keys). It
prints table names, counts, and key ids only. ``audit-raw`` needs no key: it reads
the stored representation as a dump or bucket snapshot would expose it and reports
whether anything is not ciphertext. See docs/ENCRYPTION-AT-REST.md.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.media import EncryptingMediaStore, build_plain_media_store
from eimir.media.base import MediaStore
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
    "audit-raw",
)

DEFAULT_MEDIA_SAMPLE = 200


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=COMMANDS)
    parser.add_argument(
        "--media-sample",
        type=int,
        default=DEFAULT_MEDIA_SAMPLE,
        metavar="N",
        help="audit-raw: number of referenced media objects to inspect (0 = all). "
        "Each inspected object is fetched once, so a large bucket costs egress.",
    )
    args = parser.parse_args(argv)
    if args.media_sample < 0:
        parser.error("--media-sample must not be negative")

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

            if args.command == "audit-raw":
                return _audit_raw(session, build_plain_media_store(settings), args.media_sample)

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


def _audit_raw(session: Session, plain_store: MediaStore, media_sample: int) -> int:
    report = lifecycle.RawAuditReport()
    lifecycle.audit_raw_payloads(session, report)
    lifecycle.audit_raw_media(session, plain_store, report, sample=media_sample)
    print(f"rows={dict(report.rows)}")
    print(f"not_enveloped={dict(report.not_enveloped)}")
    print(
        f"media_total={report.objects_total} sampled={report.objects_sampled} "
        f"encrypted={report.objects_encrypted} plaintext={report.objects_plaintext} "
        f"absent_homes={report.objects_absent}"
    )
    print("result=" + ("ok" if report.ok else "FAILED"))
    return 0 if report.ok else 1


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
