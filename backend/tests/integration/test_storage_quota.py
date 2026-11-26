"""Measuring a Space against its Cloud storage quota (#2141).

The usage counts every Space attachment at its actual size, and a file in
flight at its declared size. Failed, deleted and Account media do not count.
Only Cloud meters storage; the Space's `storage.cloud_quota_50gb` capability
selects the Premium value.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.attachments.quota import (
    SpaceStorage,
    space_quota,
    space_storage,
    space_usage,
)
from eimir.config import Deployment, Settings, get_settings
from eimir.core.clock import now
from eimir.db.locks import advisory_key
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.entitlements.service import record_grant
from eimir.identity.models import Account
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

FREE = 1_000
PREMIUM = 10_000


def _attachment(
    session: Session,
    account: Account,
    space_id: UUID | None,
    status: AttachmentStatus,
    *,
    declared_size: int,
    size: int | None = None,
    has_thumbnail: bool = False,
) -> Attachment:
    attachment = Attachment(
        space_id=space_id,
        owner_id=account.id,
        privacy_class="OWNER_ONLY",
        status=status.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=declared_size,
        mime_type="image/jpeg" if size is not None else None,
        size=size,
        has_thumbnail=has_thumbnail,
        ready_at=now() if status is AttachmentStatus.READY else None,
        payload=AttachmentPayload(original_name="photo.jpg"),
    )
    session.add(attachment)
    session.flush()
    return attachment


def _cloud(**values: object) -> Settings:
    update: dict[str, object] = {
        "deployment": Deployment.CLOUD,
        "storage_quota_free_bytes": FREE,
        "storage_quota_premium_bytes": PREMIUM,
    }
    update.update(values)
    return get_settings().model_copy(update=update)


def _grant(session: Session, space, *, capabilities=None, until=None):  # type: ignore[no-untyped-def]
    return record_grant(
        session,
        space_id=space.id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        effective_from=now() - timedelta(days=30),
        effective_until=until,
        capabilities=capabilities,
    )


def test_usage_counts_files_in_flight_and_ready_at_their_size(session: Session) -> None:
    account = make_account(session, "Uploader")
    space = make_space(session, account)
    _attachment(session, account, space.id, AttachmentStatus.PENDING, declared_size=1)
    _attachment(session, account, space.id, AttachmentStatus.UPLOADING, declared_size=10)
    _attachment(session, account, space.id, AttachmentStatus.VALIDATING, declared_size=100)
    # A finished file counts with the size the server established, not the
    # declared one, and its thumbnail adds nothing.
    _attachment(
        session,
        account,
        space.id,
        AttachmentStatus.READY,
        declared_size=9_999,
        size=1_000,
        has_thumbnail=True,
    )

    assert space_usage(session, space.id) == 1_111


@pytest.mark.parametrize(
    "status",
    [AttachmentStatus.FAILED, AttachmentStatus.DELETING, AttachmentStatus.DELETE_FAILED],
)
def test_failed_and_deleted_files_do_not_count(session: Session, status: AttachmentStatus) -> None:
    account = make_account(session, "Uploader")
    space = make_space(session, account)
    _attachment(session, account, space.id, status, declared_size=500, size=400)

    assert space_usage(session, space.id) == 0


def test_account_media_and_other_spaces_do_not_count(session: Session) -> None:
    account = make_account(session, "Uploader")
    space = make_space(session, account)
    other = make_space(session, make_account(session, "Elsewhere"))
    # The profile photo belongs to the Account, not to any Space.
    _attachment(session, account, None, AttachmentStatus.READY, declared_size=70, size=70)
    _attachment(session, account, other.id, AttachmentStatus.READY, declared_size=80, size=80)
    _attachment(session, account, space.id, AttachmentStatus.READY, declared_size=5, size=5)

    assert space_usage(session, space.id) == 5


def test_an_empty_space_uses_nothing(session: Session) -> None:
    space = make_space(session, make_account(session, "New"))

    assert space_usage(session, space.id) == 0


def test_self_hosted_is_unmetered(session: Session) -> None:
    space = make_space(session, make_account(session, "Self-Hosted"))
    _grant(session, space)
    settings = _cloud(deployment=Deployment.SELF_HOSTED)

    assert space_quota(session, space.id, settings=settings) is None


def test_cloud_free_space_gets_the_free_quota(session: Session) -> None:
    space = make_space(session, make_account(session, "Free"))

    assert space_quota(session, space.id, settings=_cloud()) == FREE


def test_cloud_space_with_the_capability_gets_the_premium_quota(session: Session) -> None:
    space = make_space(session, make_account(session, "Premium"))
    _grant(session, space)

    assert space_quota(session, space.id, settings=_cloud()) == PREMIUM


def test_a_grant_without_the_storage_capability_keeps_the_free_quota(session: Session) -> None:
    space = make_space(session, make_account(session, "Partial"))
    _grant(session, space, capabilities=[Capability.GAMES_COUPLE.value])

    assert space_quota(session, space.id, settings=_cloud()) == FREE


def test_an_expired_grant_falls_back_to_the_free_quota(session: Session) -> None:
    space = make_space(session, make_account(session, "Downgraded"))
    grant = _grant(session, space)
    grant.status = EntitlementStatus.EXPIRED.value
    grant.effective_until = now() - timedelta(days=1)
    session.flush()

    assert space_quota(session, space.id, settings=_cloud()) == FREE


def test_an_empty_setting_leaves_that_tier_unmetered(session: Session) -> None:
    free = make_space(session, make_account(session, "Free"))
    premium = make_space(session, make_account(session, "Premium"))
    _grant(session, premium)

    assert space_quota(session, free.id, settings=_cloud(storage_quota_free_bytes=None)) is None
    assert (
        space_quota(session, premium.id, settings=_cloud(storage_quota_premium_bytes=None)) is None
    )


def test_the_limit_itself_fits_and_one_byte_more_does_not() -> None:
    storage = SpaceStorage(used=900, quota=FREE)

    assert storage.available == 100
    assert storage.fits(100)
    assert not storage.fits(101)


def test_a_space_over_its_quota_after_a_downgrade_has_nothing_available() -> None:
    storage = SpaceStorage(used=PREMIUM, quota=FREE)

    # Nothing is deleted; only new bytes are refused.
    assert storage.available == 0
    assert not storage.fits(1)


def test_an_unmetered_space_always_fits() -> None:
    storage = SpaceStorage(used=PREMIUM, quota=None)

    assert storage.available is None
    assert storage.fits(PREMIUM)


def test_measuring_with_the_lock_serializes_the_space(session: Session, engine: Engine) -> None:
    account = make_account(session, "Uploader")
    space = make_space(session, account)
    _attachment(session, account, space.id, AttachmentStatus.READY, declared_size=600, size=600)

    storage = space_storage(session, space.id, lock=True, settings=_cloud())

    assert storage == SpaceStorage(used=600, quota=FREE)
    key = advisory_key("space-storage-quota", str(space.id))
    with engine.connect() as other:
        assert other.scalar(select(func.pg_try_advisory_xact_lock(key))) is False
        other.rollback()


# --- Individual quota per Space (ServerAdmin part 3, #2324) ------------------


def _override(session: Session, space, quota: int, until=None):  # type: ignore[no-untyped-def]
    from eimir.attachments.quota_override import SpaceStorageQuotaOverride

    session.add(
        SpaceStorageQuotaOverride(
            space_id=space.id, quota_bytes=quota, effective_until=until, set_at=now()
        )
    )
    session.flush()


def test_override_replaces_the_tier_quota_while_active(session: Session) -> None:
    account = make_account(session, "Owner")
    space = make_space(session, account)
    _override(session, space, 7_000, until=now() + timedelta(days=3))
    assert space_quota(session, space.id, settings=_cloud()) == 7_000


def test_override_can_be_lower_than_the_tier_value(session: Session) -> None:
    account = make_account(session, "Owner")
    space = make_space(session, account)
    _grant(session, space, capabilities=[Capability.STORAGE_CLOUD_QUOTA_50GB.value])
    _override(session, space, 500)
    assert space_quota(session, space.id, settings=_cloud()) == 500


def test_expired_override_falls_back_to_the_tier_value(session: Session) -> None:
    account = make_account(session, "Owner")
    space = make_space(session, account)
    _override(session, space, 7_000, until=now() - timedelta(minutes=1))
    assert space_quota(session, space.id, settings=_cloud()) == FREE


def test_override_is_ignored_on_self_hosted(session: Session) -> None:
    account = make_account(session, "Owner")
    space = make_space(session, account)
    _override(session, space, 7_000)
    settings = get_settings().model_copy(update={"deployment": Deployment.SELF_HOSTED})
    assert space_quota(session, space.id, settings=settings) is None


def test_override_below_usage_refuses_new_bytes_and_keeps_the_files(session: Session) -> None:
    account = make_account(session, "Owner")
    space = make_space(session, account)
    _attachment(session, account, space.id, AttachmentStatus.READY, declared_size=800, size=800)
    _override(session, space, 500)
    storage = space_storage(session, space.id, settings=_cloud())
    assert storage.used == 800
    assert storage.available == 0
    assert not storage.fits(1)
