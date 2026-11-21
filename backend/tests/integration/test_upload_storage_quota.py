"""A new upload must fit the Space's Cloud storage quota (#2141).

The declared size is checked when the upload is registered and reserves its
room until the file is finished, fails or is deleted. Checking and adding the
row happen under the Space's storage lock. A Space over its quota keeps
reading and deleting; only new bytes are refused. Self-Hosted is unmetered.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from eimir.attachments import quota
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.config import Deployment, get_settings
from eimir.core.clock import now
from eimir.db.locks import advisory_key
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus
from eimir.entitlements.service import record_grant
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

FREE = 10_000
PREMIUM = 100_000


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> Callable[..., None]:
    """Run as Cloud with these quotas, until the test ends."""

    def configure(free: int | None = FREE, premium: int | None = PREMIUM) -> None:
        settings = get_settings().model_copy(
            update={
                "deployment": Deployment.CLOUD,
                "storage_quota_free_bytes": free,
                "storage_quota_premium_bytes": premium,
            }
        )
        monkeypatch.setattr(quota, "get_settings", lambda: settings)

    return configure


@pytest.fixture
def member(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    space = make_space(session, account)
    return {"account": account, "space": space, "token": sign_in(session, account)}


def _register(client, member, size: int, media_type: str = "IMAGE"):  # type: ignore[no-untyped-def]
    mime = {"IMAGE": "image/jpeg", "DOCUMENT": "application/pdf"}[media_type]
    return client.post(
        f"/api/v1/spaces/{member['space'].id}/attachments",
        json={
            "mediaType": media_type,
            "originalName": "file",
            "expectedMimeType": mime,
            "expectedSize": size,
        },
        headers=auth(member["token"]),
    )


def _delete(client, session: Session, member, identifier: str):  # type: ignore[no-untyped-def]
    attachment = session.get(Attachment, identifier)
    assert attachment is not None
    return client.delete(
        f"/api/v1/spaces/{member['space'].id}/attachments/{identifier}",
        headers={**auth(member["token"]), "If-Match": f'"{attachment.version}"'},
    )


def _rows(session: Session, member) -> int:  # type: ignore[no-untyped-def]
    return int(
        session.scalar(
            select(func.count(Attachment.id)).where(Attachment.space_id == member["space"].id)
        )
        or 0
    )


def test_self_hosted_ignores_the_quota_settings(client, session, member, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(update={"storage_quota_free_bytes": 1})
    monkeypatch.setattr(quota, "get_settings", lambda: settings)

    assert _register(client, member, 5_000).status_code == 201


def test_an_upload_that_hits_the_quota_exactly_fits(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud()

    created = _register(client, member, FREE)

    assert created.status_code == 201, created.text
    assert quota.space_usage(session, member["space"].id) == FREE


def test_one_byte_over_is_refused_and_creates_nothing(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud()

    refused = _register(client, member, FREE + 1)

    assert refused.status_code == 413, refused.text
    assert refused.json()["code"] == "STORAGE_QUOTA_EXCEEDED"
    assert _rows(session, member) == 0


@pytest.mark.parametrize("media_type", ["IMAGE", "DOCUMENT"])
def test_every_media_type_counts(client, session, member, cloud, media_type: str) -> None:  # type: ignore[no-untyped-def]
    cloud(free=1_000)

    refused = _register(client, member, 1_001, media_type)

    assert refused.status_code == 413, refused.text
    assert refused.json()["code"] == "STORAGE_QUOTA_EXCEEDED"


def test_an_open_upload_reserves_its_room(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud()
    assert _register(client, member, 6_000).status_code == 201

    second = _register(client, member, 5_000)

    assert second.status_code == 413, second.text
    assert _register(client, member, 4_000).status_code == 201


def test_a_failed_upload_gives_its_room_back(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud()
    first = _register(client, member, FREE).json()["attachment"]["id"]
    attachment = session.get(Attachment, first)
    assert attachment is not None
    attachment.status = AttachmentStatus.FAILED.value
    attachment.failed_at = now()
    session.flush()

    assert _register(client, member, FREE).status_code == 201


def test_a_deleted_upload_gives_its_room_back(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud()
    first = _register(client, member, FREE).json()["attachment"]["id"]
    deleted = _delete(client, session, member, first)
    assert deleted.status_code == 204, deleted.text

    assert _register(client, member, FREE).status_code == 201


def test_premium_gets_the_premium_quota(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud()
    record_grant(
        session,
        space_id=member["space"].id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        effective_from=now() - timedelta(days=1),
    )

    assert _register(client, member, FREE * 5).status_code == 201
    refused = _register(client, member, PREMIUM)
    assert refused.status_code == 413, refused.text


def test_a_space_over_its_quota_keeps_reading_and_deleting(client, session, member, cloud) -> None:  # type: ignore[no-untyped-def]
    cloud(free=PREMIUM)
    kept = _register(client, member, FREE * 5).json()["attachment"]["id"]
    # A downgrade: the quota now is far below what the Space holds.
    cloud(free=FREE)
    path = f"/api/v1/spaces/{member['space'].id}/attachments/{kept}"

    assert _register(client, member, 1).status_code == 413
    assert client.get(path, headers=auth(member["token"])).status_code == 200
    assert _delete(client, session, member, kept).status_code == 204
    assert _register(client, member, 1).status_code == 201


def test_registering_holds_the_space_storage_lock(
    client, session, member, cloud, engine: Engine
) -> None:  # type: ignore[no-untyped-def]
    cloud()

    assert _register(client, member, 1).status_code == 201

    key = advisory_key("space-storage-quota", str(member["space"].id))
    with engine.connect() as other:
        assert other.scalar(select(func.pg_try_advisory_xact_lock(key))) is False
        other.rollback()
