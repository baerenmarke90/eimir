"""Synthetic database/media state for the Self-Hosted recovery acceptance gate.

This module is test tooling. It never reads production input and never prints
credentials, tokens, protected payloads, filenames, or tenant identifiers.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, date, datetime
from io import BytesIO
from uuid import UUID

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from eimir.auth import passwords
from eimir.config import DatabaseSettings
from eimir.media.base import build_storage_key

FIXTURE_PASSWORD = "recovery-fixture-password"
OWNER_EMAIL = "recovery-owner@fixture.invalid"
PARTNER_EMAIL = "recovery-partner@fixture.invalid"
OUTSIDER_EMAIL = "recovery-outsider@fixture.invalid"

OWNER_ID = UUID("01990000-0000-7000-8000-000000000001")
PARTNER_ID = UUID("01990000-0000-7000-8000-000000000002")
OUTSIDER_ID = UUID("01990000-0000-7000-8000-000000000003")
SPACE_ID = UUID("01990000-0000-7000-8000-000000000101")
FOREIGN_SPACE_ID = UUID("01990000-0000-7000-8000-000000000102")
MEMORY_ID = UUID("01990000-0000-7000-8000-000000000201")
ATTACHMENT_ID = UUID("01990000-0000-7000-8000-000000000301")
TEMPORARY_ATTACHMENT_ID = UUID("01990000-0000-7000-8000-000000000302")
PRIVATE_HEART_ID = UUID("01990000-0000-7000-8000-000000000401")
PARTNER_PRIVATE_HEART_ID = UUID("01990000-0000-7000-8000-000000000402")
FOREIGN_PRIVATE_HEART_ID = UUID("01990000-0000-7000-8000-000000000403")

DURABLE_ORIGINAL = b"eimir-recovery-durable-original-v1"
DURABLE_THUMBNAIL = b"eimir-recovery-durable-thumbnail-v1"
TEMPORARY_MEDIA = b"eimir-recovery-temporary-upload-v1"


class FixtureError(RuntimeError):
    """The deterministic acceptance fixture is absent or inconsistent."""


def _engine():  # type: ignore[no-untyped-def]
    return create_engine(DatabaseSettings().database_url, future=True)


def _expected_head() -> str:
    head = ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
    if head is None:
        raise FixtureError("Alembic has no current head.")
    return head


def _database_revision(session: Session) -> str:
    revision = session.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    if not isinstance(revision, str):
        raise FixtureError("Alembic revision is invalid.")
    return revision


def _current_models() -> None:
    # Import the same production models Alembic and the application register.
    # Keeping imports local lets seed-0032 use the current image without asking
    # current ORM metadata to operate against the older schema.
    from eimir.attachments import binding as _binding  # noqa: F401
    from eimir.attachments import models as _attachments  # noqa: F401
    from eimir.heart_moments import models as _heart_moments  # noqa: F401
    from eimir.identity import models as _identity  # noqa: F401
    from eimir.memories import models as _memories  # noqa: F401
    from eimir.relationship import models as _relationship  # noqa: F401


def seed_current() -> None:
    _current_models()
    from eimir.attachments.binding import MemoryAttachment
    from eimir.attachments.models import (
        Attachment,
        AttachmentPayload,
        AttachmentStatus,
        MediaType,
    )
    from eimir.authorization import ContentVisibility, PrivacyClass, privacy_for
    from eimir.heart_moments.models import (
        HeartEmotion,
        HeartMoment,
        HeartMomentPayload,
    )
    from eimir.identity.models import Account, AccountEmail, AuthIdentity, AuthProvider
    from eimir.media import get_media_store
    from eimir.memories.models import Memory, MemoryPayload
    from eimir.relationship.models import (
        DurationDisplayMode,
        Membership,
        MembershipRole,
        MembershipStatus,
        Space,
        SpaceProfile,
    )

    now = datetime.now(UTC)
    with Session(_engine()) as session, session.begin():
        if session.get(Account, OWNER_ID) is not None:
            raise FixtureError("Recovery fixture already exists.")

        accounts = (
            Account(
                id=OWNER_ID,
                display_name="Recovery Owner",
                locale="en",
                timezone="UTC",
                version=1,
            ),
            Account(
                id=PARTNER_ID,
                display_name="Recovery Partner",
                locale="en",
                timezone="UTC",
                version=1,
            ),
            Account(
                id=OUTSIDER_ID,
                display_name="Recovery Outsider",
                locale="en",
                timezone="UTC",
                version=1,
            ),
        )
        session.add_all(accounts)
        session.flush()

        password_hash = passwords.hash_password(FIXTURE_PASSWORD)
        for offset, (account, email) in enumerate(
            zip(accounts, (OWNER_EMAIL, PARTNER_EMAIL, OUTSIDER_EMAIL), strict=True),
            start=1,
        ):
            session.add(
                AccountEmail(
                    id=UUID(f"01990000-0000-7000-8000-{1000 + offset:012d}"),
                    account_id=account.id,
                    email=email,
                    verified_at=now,
                    is_primary=True,
                )
            )
            session.add(
                AuthIdentity(
                    id=UUID(f"01990000-0000-7000-8000-{2000 + offset:012d}"),
                    account_id=account.id,
                    provider=AuthProvider.LOCAL_PASSWORD.value,
                    subject=email,
                    secret_hash=password_hash,
                )
            )

        session.add_all((Space(id=SPACE_ID), Space(id=FOREIGN_SPACE_ID)))
        session.flush()
        session.add_all(
            (
                SpaceProfile(
                    id=UUID("01990000-0000-7000-8000-000000000601"),
                    space_id=SPACE_ID,
                    show_relationship_duration=True,
                    duration_display_mode=DurationDisplayMode.YEARS_MONTHS.value,
                    version=1,
                ),
                SpaceProfile(
                    id=UUID("01990000-0000-7000-8000-000000000602"),
                    space_id=FOREIGN_SPACE_ID,
                    show_relationship_duration=True,
                    duration_display_mode=DurationDisplayMode.YEARS_MONTHS.value,
                    version=1,
                ),
                Membership(
                    id=UUID("01990000-0000-7000-8000-000000000501"),
                    space_id=SPACE_ID,
                    account_id=OWNER_ID,
                    role=MembershipRole.PARTNER.value,
                    status=MembershipStatus.ACTIVE.value,
                    joined_at=now,
                ),
                Membership(
                    id=UUID("01990000-0000-7000-8000-000000000502"),
                    space_id=SPACE_ID,
                    account_id=PARTNER_ID,
                    role=MembershipRole.PARTNER.value,
                    status=MembershipStatus.ACTIVE.value,
                    joined_at=now,
                ),
                Membership(
                    id=UUID("01990000-0000-7000-8000-000000000503"),
                    space_id=FOREIGN_SPACE_ID,
                    account_id=OUTSIDER_ID,
                    role=MembershipRole.PARTNER.value,
                    status=MembershipStatus.ACTIVE.value,
                    joined_at=now,
                ),
            )
        )

        memory = Memory(
            id=MEMORY_ID,
            space_id=SPACE_ID,
            owner_id=OWNER_ID,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            happened_on=date(2025, 6, 15),
            payload=MemoryPayload(
                title="Recovery fixture memory",
                body="Synthetic restore evidence.",
            ),
            version=1,
        )
        attachment = Attachment(
            id=ATTACHMENT_ID,
            space_id=SPACE_ID,
            owner_id=OWNER_ID,
            privacy_class=PrivacyClass.OWNER_ONLY.value,
            status=AttachmentStatus.READY.value,
            media_type=MediaType.IMAGE.value,
            declared_mime_type="image/png",
            declared_size=len(DURABLE_ORIGINAL),
            mime_type="image/png",
            size=len(DURABLE_ORIGINAL),
            width=1,
            height=1,
            has_thumbnail=True,
            ready_at=now,
            payload=AttachmentPayload(original_name="synthetic-recovery.png"),
            version=1,
        )
        temporary_attachment = Attachment(
            id=TEMPORARY_ATTACHMENT_ID,
            space_id=SPACE_ID,
            owner_id=OWNER_ID,
            privacy_class=PrivacyClass.OWNER_ONLY.value,
            status=AttachmentStatus.UPLOADING.value,
            media_type=MediaType.IMAGE.value,
            declared_mime_type="image/png",
            declared_size=len(TEMPORARY_MEDIA),
            uploaded_at=now,
            payload=AttachmentPayload(original_name="synthetic-temporary.png"),
            version=1,
        )
        session.add_all((memory, attachment, temporary_attachment))
        session.flush()
        session.add(
            MemoryAttachment(
                id=UUID("01990000-0000-7000-8000-000000000701"),
                memory_id=MEMORY_ID,
                attachment_id=ATTACHMENT_ID,
                position=0,
            )
        )
        session.add_all(
            (
                HeartMoment(
                    id=PRIVATE_HEART_ID,
                    space_id=SPACE_ID,
                    owner_id=OWNER_ID,
                    privacy_class=privacy_for(ContentVisibility.PRIVATE).value,
                    happened_on=date(2025, 6, 16),
                    payload=HeartMomentPayload(
                        text="Owner-only recovery fixture",
                        emotion=HeartEmotion.GRATEFUL,
                    ),
                    version=1,
                ),
                HeartMoment(
                    id=PARTNER_PRIVATE_HEART_ID,
                    space_id=SPACE_ID,
                    owner_id=PARTNER_ID,
                    privacy_class=privacy_for(ContentVisibility.PRIVATE).value,
                    happened_on=date(2025, 6, 17),
                    payload=HeartMomentPayload(
                        text="Partner-only recovery fixture",
                        emotion=HeartEmotion.HAPPY,
                    ),
                    version=1,
                ),
                HeartMoment(
                    id=FOREIGN_PRIVATE_HEART_ID,
                    space_id=FOREIGN_SPACE_ID,
                    owner_id=OUTSIDER_ID,
                    privacy_class=privacy_for(ContentVisibility.PRIVATE).value,
                    happened_on=date(2025, 6, 18),
                    payload=HeartMomentPayload(
                        text="Foreign tenant recovery fixture",
                        emotion=HeartEmotion.SEEN,
                    ),
                    version=1,
                ),
            )
        )

        store = get_media_store()
        store.put(
            build_storage_key(SPACE_ID, ATTACHMENT_ID),
            BytesIO(DURABLE_ORIGINAL),
            "image/png",
        )
        store.put(
            build_storage_key(SPACE_ID, ATTACHMENT_ID, "thumbnail"),
            BytesIO(DURABLE_THUMBNAIL),
            "image/jpeg",
        )
        store.put(
            build_storage_key(SPACE_ID, TEMPORARY_ATTACHMENT_ID),
            BytesIO(TEMPORARY_MEDIA),
            "image/png",
        )


def _seed_0032_rows(session: Session) -> None:
    now = datetime.now(UTC)
    password_hash = passwords.hash_password(FIXTURE_PASSWORD)
    account_rows = (
        (OWNER_ID, "Recovery Owner", OWNER_EMAIL),
        (PARTNER_ID, "Recovery Partner", PARTNER_EMAIL),
        (OUTSIDER_ID, "Recovery Outsider", OUTSIDER_EMAIL),
    )
    for offset, (account_id, name, email) in enumerate(account_rows, start=1):
        session.execute(
            text(
                "INSERT INTO accounts "
                "(id, display_name, birthday, locale, timezone, disabled_at) "
                "VALUES (:id, :name, NULL, 'en', 'UTC', NULL)"
            ),
            {"id": account_id, "name": name},
        )
        session.execute(
            text(
                "INSERT INTO account_emails "
                "(id, account_id, email, verified_at, is_primary) "
                "VALUES (:id, :account_id, :email, :verified_at, true)"
            ),
            {
                "id": UUID(f"01990000-0000-7000-8000-{1000 + offset:012d}"),
                "account_id": account_id,
                "email": email,
                "verified_at": now,
            },
        )
        session.execute(
            text(
                "INSERT INTO auth_identities "
                "(id, account_id, provider, subject, secret_hash, issuer, connection_id) "
                "VALUES (:id, :account_id, 'LOCAL_PASSWORD', :email, :secret_hash, NULL, NULL)"
            ),
            {
                "id": UUID(f"01990000-0000-7000-8000-{2000 + offset:012d}"),
                "account_id": account_id,
                "email": email,
                "secret_hash": password_hash,
            },
        )

    session.execute(
        text("INSERT INTO spaces (id) VALUES (:first), (:second)"),
        {"first": SPACE_ID, "second": FOREIGN_SPACE_ID},
    )
    for identifier, space_id, account_id in (
        (UUID("01990000-0000-7000-8000-000000000501"), SPACE_ID, OWNER_ID),
        (UUID("01990000-0000-7000-8000-000000000502"), SPACE_ID, PARTNER_ID),
        (UUID("01990000-0000-7000-8000-000000000503"), FOREIGN_SPACE_ID, OUTSIDER_ID),
    ):
        session.execute(
            text(
                "INSERT INTO memberships "
                "(id, space_id, account_id, role, status, joined_at, ended_at) "
                "VALUES (:id, :space_id, :account_id, 'PARTNER', 'ACTIVE', :joined_at, NULL)"
            ),
            {
                "id": identifier,
                "space_id": space_id,
                "account_id": account_id,
                "joined_at": now,
            },
        )
    for identifier, space_id in (
        (UUID("01990000-0000-7000-8000-000000000601"), SPACE_ID),
        (UUID("01990000-0000-7000-8000-000000000602"), FOREIGN_SPACE_ID),
    ):
        session.execute(
            text(
                "INSERT INTO space_profiles "
                "(id, space_id, relationship_started_on, show_relationship_duration, "
                "duration_display_mode, version) "
                "VALUES (:id, :space_id, NULL, true, 'YEARS_MONTHS', 1)"
            ),
            {"id": identifier, "space_id": space_id},
        )

    session.execute(
        text(
            "INSERT INTO memories "
            "(id, space_id, owner_id, privacy_class, happened_on, crypto_version, "
            "payload, version) "
            "VALUES (:id, :space_id, :owner_id, 'SPACE_SHARED', :happened_on, 0, "
            "CAST(:payload AS jsonb), 1)"
        ),
        {
            "id": MEMORY_ID,
            "space_id": SPACE_ID,
            "owner_id": OWNER_ID,
            "happened_on": date(2025, 6, 15),
            "payload": json.dumps(
                {"title": "Recovery fixture memory", "body": "Synthetic upgrade evidence."}
            ),
        },
    )
    for identifier, status, media_bytes, ready_at in (
        (ATTACHMENT_ID, "READY", DURABLE_ORIGINAL, now),
        (TEMPORARY_ATTACHMENT_ID, "UPLOADING", TEMPORARY_MEDIA, None),
    ):
        session.execute(
            text(
                "INSERT INTO attachments "
                "(id, space_id, owner_id, privacy_class, status, media_type, "
                "declared_mime_type, declared_size, mime_type, size, width, height, "
                "duration_seconds, has_thumbnail, failure_code, ready_at, failed_at, "
                "uploaded_at, crypto_version, payload, version) "
                "VALUES (:id, :space_id, :owner_id, 'OWNER_ONLY', :status, 'IMAGE', "
                "'image/png', :size, :mime_type, :persisted_size, :width, :height, NULL, "
                ":has_thumbnail, NULL, :ready_at, NULL, :uploaded_at, 0, "
                "CAST(:payload AS jsonb), 1)"
            ),
            {
                "id": identifier,
                "space_id": SPACE_ID,
                "owner_id": OWNER_ID,
                "status": status,
                "size": len(media_bytes),
                "mime_type": "image/png" if status == "READY" else None,
                "persisted_size": len(media_bytes) if status == "READY" else None,
                "width": 1 if status == "READY" else None,
                "height": 1 if status == "READY" else None,
                "has_thumbnail": status == "READY",
                "ready_at": ready_at,
                "uploaded_at": now,
                "payload": json.dumps(
                    {
                        "original_name": (
                            "synthetic-recovery.png"
                            if status == "READY"
                            else "synthetic-temporary.png"
                        )
                    }
                ),
            },
        )
    session.execute(
        text(
            "INSERT INTO memory_attachments (id, memory_id, attachment_id, position) "
            "VALUES (:id, :memory_id, :attachment_id, 0)"
        ),
        {
            "id": UUID("01990000-0000-7000-8000-000000000701"),
            "memory_id": MEMORY_ID,
            "attachment_id": ATTACHMENT_ID,
        },
    )
    for identifier, space_id, owner_id, fixture_text, emotion in (
        (PRIVATE_HEART_ID, SPACE_ID, OWNER_ID, "Owner-only recovery fixture", "GRATEFUL"),
        (
            PARTNER_PRIVATE_HEART_ID,
            SPACE_ID,
            PARTNER_ID,
            "Partner-only recovery fixture",
            "HAPPY",
        ),
        (
            FOREIGN_PRIVATE_HEART_ID,
            FOREIGN_SPACE_ID,
            OUTSIDER_ID,
            "Foreign tenant recovery fixture",
            "SEEN",
        ),
    ):
        session.execute(
            text(
                "INSERT INTO heart_moments "
                "(id, space_id, owner_id, privacy_class, happened_on, attachment_id, "
                "crypto_version, payload, version) "
                "VALUES (:id, :space_id, :owner_id, 'OWNER_ONLY', :happened_on, NULL, 0, "
                "CAST(:payload AS jsonb), 1)"
            ),
            {
                "id": identifier,
                "space_id": space_id,
                "owner_id": owner_id,
                "happened_on": date(2025, 6, 16),
                "payload": json.dumps({"text": fixture_text, "emotion": emotion}),
            },
        )


def seed_0032() -> None:
    engine = _engine()
    with Session(engine) as session, session.begin():
        if _database_revision(session) != "0032":
            raise FixtureError("Upgrade fixture requires Alembic revision 0032.")
        _seed_0032_rows(session)

    from eimir.media.local import LocalMediaStore

    # DatabaseSettings intentionally contains only the database URL. Read the
    # media root directly without loading full production validation.
    store = LocalMediaStore(os.environ.get("EIMIR_MEDIA_ROOT", "./data/media"))
    store.put(
        build_storage_key(SPACE_ID, ATTACHMENT_ID),
        BytesIO(DURABLE_ORIGINAL),
        "image/png",
    )
    store.put(
        build_storage_key(SPACE_ID, ATTACHMENT_ID, "thumbnail"),
        BytesIO(DURABLE_THUMBNAIL),
        "image/jpeg",
    )
    store.put(
        build_storage_key(SPACE_ID, TEMPORARY_ATTACHMENT_ID),
        BytesIO(TEMPORARY_MEDIA),
        "image/png",
    )


def verify(*, temporary_media_expected: bool) -> None:
    _current_models()
    from eimir.attachments.binding import MemoryAttachment
    from eimir.attachments.models import Attachment, AttachmentStatus
    from eimir.authorization import PrivacyClass
    from eimir.heart_moments.models import HeartMoment
    from eimir.identity.models import Account, AccountEmail
    from eimir.media import get_media_store
    from eimir.memories.models import Memory
    from eimir.relationship.models import Membership, MembershipStatus

    with Session(_engine()) as session:
        if _database_revision(session) != _expected_head():
            raise FixtureError("Recovery target is not at the current Alembic head.")
        owner = session.get(Account, OWNER_ID)
        if owner is None or owner.version != 1:
            raise FixtureError("Expected owner account/version is missing.")
        emails = set(
            session.execute(
                select(AccountEmail.email).where(
                    AccountEmail.account_id.in_((OWNER_ID, PARTNER_ID, OUTSIDER_ID))
                )
            ).scalars()
        )
        if emails != {OWNER_EMAIL, PARTNER_EMAIL, OUTSIDER_EMAIL}:
            raise FixtureError("Expected recovery accounts are missing.")

        memberships = set(
            session.execute(
                select(Membership.space_id, Membership.account_id).where(
                    Membership.status == MembershipStatus.ACTIVE.value
                )
            ).all()
        )
        expected_memberships = {
            (SPACE_ID, OWNER_ID),
            (SPACE_ID, PARTNER_ID),
            (FOREIGN_SPACE_ID, OUTSIDER_ID),
        }
        if memberships != expected_memberships:
            raise FixtureError("Tenant Membership assignments changed.")

        memory = session.get(Memory, MEMORY_ID)
        if (
            memory is None
            or memory.space_id != SPACE_ID
            or memory.owner_id != OWNER_ID
            or memory.privacy_class != PrivacyClass.SPACE_SHARED.value
        ):
            raise FixtureError("Shared memory tenant/owner assignment changed.")
        binding = session.execute(
            select(MemoryAttachment).where(
                MemoryAttachment.memory_id == MEMORY_ID,
                MemoryAttachment.attachment_id == ATTACHMENT_ID,
            )
        ).scalar_one_or_none()
        attachment = session.get(Attachment, ATTACHMENT_ID)
        if (
            binding is None
            or attachment is None
            or attachment.status != AttachmentStatus.READY.value
            or attachment.space_id != SPACE_ID
            or attachment.owner_id != OWNER_ID
        ):
            raise FixtureError("Durable media database references changed.")

        expected_private = {
            PRIVATE_HEART_ID: (SPACE_ID, OWNER_ID),
            PARTNER_PRIVATE_HEART_ID: (SPACE_ID, PARTNER_ID),
            FOREIGN_PRIVATE_HEART_ID: (FOREIGN_SPACE_ID, OUTSIDER_ID),
        }
        for identifier, (space_id, owner_id) in expected_private.items():
            heart = session.get(HeartMoment, identifier)
            if (
                heart is None
                or heart.space_id != space_id
                or heart.owner_id != owner_id
                or heart.privacy_class != PrivacyClass.OWNER_ONLY.value
            ):
                raise FixtureError("Owner-only tenant/owner assignment changed.")

    store = get_media_store()
    with store.open(build_storage_key(SPACE_ID, ATTACHMENT_ID)) as source:
        if source.read() != DURABLE_ORIGINAL:
            raise FixtureError("Durable original media content changed.")
    with store.open(build_storage_key(SPACE_ID, ATTACHMENT_ID, "thumbnail")) as source:
        if source.read() != DURABLE_THUMBNAIL:
            raise FixtureError("Durable thumbnail media content changed.")
    temporary_exists = store.exists(build_storage_key(SPACE_ID, TEMPORARY_ATTACHMENT_ID))
    if temporary_exists != temporary_media_expected:
        raise FixtureError("Temporary-media recovery classification changed.")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=("seed-current", "verify-restored", "seed-0032", "verify-upgraded"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        if args.command == "seed-current":
            seed_current()
        elif args.command == "verify-restored":
            verify(temporary_media_expected=False)
        elif args.command == "seed-0032":
            seed_0032()
        else:
            verify(temporary_media_expected=True)
    except FixtureError as exc:
        print(f"Recovery fixture failed: {exc}", file=sys.stderr)
        return 1
    except Exception:
        # SQLAlchemy exceptions may include bound values. Do not let synthetic
        # ProtectedPayload patterns teach production tooling to dump values.
        print("Recovery fixture failed with an unexpected internal error.", file=sys.stderr)
        return 1
    print("Recovery fixture operation completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
