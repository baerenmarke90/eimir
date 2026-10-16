"""Account-owned lifecycle for Account-global profile media (#692).

The avatar is Account-global presentation identity, so its media must belong to
the Account and not to whichever Space it happened to be uploaded into. These
tests pin the resulting invariants: a Space purge cannot take an active
Account's avatar with it, no ``Attachment`` survives pointing at a removed
Space, adoption is retry-safe, no storage home leaks, Account deletion still
removes everything, and cross-Space reads keep their existing authorization.
"""

from __future__ import annotations

import io
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments import account_media
from eimir.attachments import binding as attachment_binding
from eimir.attachments import service as attachment_service
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.deletion_media import apply_account_media_cleanup
from eimir.jobs.models import Job
from eimir.media import build_account_storage_key, build_storage_key
from eimir.media.local import LocalMediaStore
from eimir.profiles import service as profile_service
from eimir.relationship import offboarding, policy, retention
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus, Space
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

AVATAR_BYTES = b"sanitized-avatar-bytes"
THUMBNAIL_BYTES = b"sanitized-avatar-thumbnail"


def avatar_path(space_id: object, account_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/profiles/{account_id}/avatar/content"


def uploaded_image(
    session: Session,
    store: LocalMediaStore,
    *,
    account_id,
    space_id,
    has_thumbnail: bool = False,
) -> Attachment:  # type: ignore[no-untyped-def]
    """Create a READY upload in one Space with its provider objects in place."""
    attachment = Attachment(
        space_id=space_id,
        owner_id=account_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=len(AVATAR_BYTES),
        mime_type="image/jpeg",
        size=len(AVATAR_BYTES),
        width=1,
        height=1,
        has_thumbnail=has_thumbnail,
        ready_at=now(),
        payload=AttachmentPayload(original_name="avatar.jpg"),
    )
    session.add(attachment)
    session.flush()
    store.put(build_storage_key(space_id, attachment.id), io.BytesIO(AVATAR_BYTES), "image/jpeg")
    if has_thumbnail:
        store.put(
            build_storage_key(space_id, attachment.id, attachment_service.THUMBNAIL_VARIANT),
            io.BytesIO(THUMBNAIL_BYTES),
            "image/jpeg",
        )
    return attachment


def context_for(account_id, space_id) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    return AuthorizationContext(account_id=account_id, space_id=space_id)


def local_store(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> LocalMediaStore:
    """Point every media consumer in this lifecycle at one temporary store."""
    store = LocalMediaStore(tmp_path / "media")
    for module in (attachment_service, account_media, retention):
        monkeypatch.setattr(module, "get_media_store", lambda: store)
    return store


def end_all_memberships(session: Session, space_id, *, ended_at) -> None:  # type: ignore[no-untyped-def]
    memberships = session.execute(
        select(Membership).where(Membership.space_id == space_id)
    ).scalars()
    for membership in memberships:
        membership.status = MembershipStatus.LEFT.value
        membership.ended_at = ended_at
    space = session.get(Space, space_id)
    assert space is not None
    space.offboarding_purge_at = policy.purge_eligible_at(ended_at)
    session.flush()


def run_origin_cleanup_jobs(session: Session) -> int:
    """Drain the durable origin-cleanup jobs this transaction enqueued."""
    jobs = list(
        session.execute(
            select(Job).where(Job.kind == account_media.ORIGIN_CLEANUP_JOB).order_by(Job.id)
        ).scalars()
    )
    for job in jobs:
        account_media.run_origin_cleanup(session, dict(job.payload))
    return len(jobs)


def test_avatar_survives_final_purge_of_the_space_it_was_uploaded_in(
    client,
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    store = local_store(tmp_path, monkeypatch)

    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    carla = make_account(session, "Carla")
    leaving_space = make_space(session, anna)
    relationship_service.add_member(session, leaving_space.id, ben)
    remaining_space = make_space(session, anna)
    relationship_service.add_member(session, remaining_space.id, carla)
    session.flush()
    token_carla = sign_in(session, carla)

    upload = uploaded_image(
        session,
        store,
        account_id=anna.id,
        space_id=leaving_space.id,
        has_thumbnail=True,
    )
    origin_key = build_storage_key(leaving_space.id, upload.id)
    account_key = build_account_storage_key(anna.id, upload.id)

    avatar = profile_service.set_profile_attachment(
        session,
        context_for(anna.id, leaving_space.id),
        upload.id,
    )
    assert avatar is not None

    # Binding transfers ownership: the row leaves the Space immediately and the
    # object is copied to the Account home before the origin removal is queued.
    assert avatar.space_id is None
    assert store.exists(account_key)
    assert store.exists(
        build_account_storage_key(anna.id, upload.id, attachment_service.THUMBNAIL_VARIANT)
    )
    assert store.exists(origin_key)
    assert run_origin_cleanup_jobs(session) == 1
    assert not store.exists(origin_key)
    assert not store.exists(
        build_storage_key(leaving_space.id, upload.id, attachment_service.THUMBNAIL_VARIANT)
    )

    offboarding.leave_space(session, anna, leaving_space.id)
    offboarding.leave_space(session, ben, leaving_space.id)
    instant = now()
    end_all_memberships(
        session,
        leaving_space.id,
        ended_at=instant - policy.SPACE_OFFBOARDING_RETENTION - timedelta(days=1),
    )

    purged_spaces, _purged_media, _transfers = retention.purge_due_spaces(
        session,
        current_time=instant,
    )
    session.flush()

    assert purged_spaces == 1
    assert session.get(Space, leaving_space.id) is None
    # No Attachment row may reference a Space that no longer exists.
    assert (
        session.execute(
            select(func.count(Attachment.id)).where(Attachment.space_id == leaving_space.id)
        ).scalar_one()
        == 0
    )

    surviving = profile_service.profile_attachment(session, anna.id)
    assert surviving is not None
    assert surviving.id == upload.id
    assert surviving.space_id is None
    assert surviving.status == AttachmentStatus.READY.value
    assert store.exists(account_key)

    # The still-active Space renders the same current avatar through the normal
    # profile authorization, not through any storage-location exception.
    carla_read = client.get(
        avatar_path(remaining_space.id, anna.id),
        headers=auth(token_carla),
    )
    assert carla_read.status_code == 200
    assert carla_read.content == THUMBNAIL_BYTES

    # Ben left and his Space is gone; he keeps no cross-Space read.
    token_ben = sign_in(session, ben)
    ben_read = client.get(
        avatar_path(remaining_space.id, anna.id),
        headers=auth(token_ben),
    )
    assert ben_read.status_code == 404

    # Account-owned media is not reachable through any Space attachment route.
    generic_read = client.get(
        f"/api/v1/spaces/{remaining_space.id}/attachments/{upload.id}/content",
        headers=auth(token_carla),
    )
    assert generic_read.status_code == 404

    # A repeated scan finds nothing left to do and stays safe.
    assert retention.purge_due_spaces(session, current_time=instant) == (0, 0, 0)
    assert store.exists(account_key)


def test_final_purge_adopts_an_avatar_bound_before_adoption_existed(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rows bound by the previous contract are Space-owned and must be rescued."""
    store = local_store(tmp_path, monkeypatch)

    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    legacy_space = make_space(session, anna)
    relationship_service.add_member(session, legacy_space.id, ben)
    session.flush()

    legacy = uploaded_image(session, store, account_id=anna.id, space_id=legacy_space.id)
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=anna.id,
            attachment_id=legacy.id,
        )
    )
    session.flush()

    unbound = uploaded_image(session, store, account_id=anna.id, space_id=legacy_space.id)
    origin_key = build_storage_key(legacy_space.id, legacy.id)
    account_key = build_account_storage_key(anna.id, legacy.id)

    instant = now()
    end_all_memberships(
        session,
        legacy_space.id,
        ended_at=instant - policy.SPACE_OFFBOARDING_RETENTION - timedelta(days=1),
    )

    purged_spaces, purged_media, _transfers = retention.purge_due_spaces(
        session,
        current_time=instant,
    )
    session.flush()

    assert purged_spaces == 1
    assert purged_media == 1
    assert session.get(Space, legacy_space.id) is None
    assert session.get(Attachment, unbound.id) is None

    adopted = session.get(Attachment, legacy.id)
    assert adopted is not None
    assert adopted.space_id is None
    assert store.exists(account_key)
    assert run_origin_cleanup_jobs(session) == 1
    assert not store.exists(origin_key)


def test_account_deletion_removes_preserved_profile_media(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Preservation for another active Space must not become indefinite retention."""
    store = local_store(tmp_path, monkeypatch)

    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()

    upload = uploaded_image(
        session,
        store,
        account_id=anna.id,
        space_id=space.id,
        has_thumbnail=True,
    )
    avatar = profile_service.set_profile_attachment(
        session,
        context_for(anna.id, space.id),
        upload.id,
    )
    assert avatar is not None and avatar.space_id is None
    run_origin_cleanup_jobs(session)

    account_key = build_account_storage_key(anna.id, upload.id)
    thumbnail_key = build_account_storage_key(
        anna.id,
        upload.id,
        attachment_service.THUMBNAIL_VARIANT,
    )
    assert store.exists(account_key)

    accepted_at = now()
    apply_accepted_tombstone(session, anna.id, accepted_at=accepted_at)
    apply_core_cleanup(session, anna.id)
    result = apply_account_media_cleanup(session, anna.id)

    assert result.converged
    assert result.purged == 1
    assert session.get(Attachment, upload.id) is None
    assert profile_service.profile_attachment(session, anna.id) is None
    assert not store.exists(account_key)
    assert not store.exists(thumbnail_key)


def test_replacing_an_adopted_avatar_uses_the_existing_cleanup_lifecycle(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = local_store(tmp_path, monkeypatch)

    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    session.flush()

    first = uploaded_image(session, store, account_id=anna.id, space_id=space.id)
    second = uploaded_image(session, store, account_id=anna.id, space_id=space.id)
    context = context_for(anna.id, space.id)

    profile_service.set_profile_attachment(session, context, first.id)
    assert first.space_id is None

    # Re-sending the current avatar is a no-op even though the row is no longer
    # a candidate in any Space.
    unchanged = profile_service.set_profile_attachment(session, context, first.id)
    assert unchanged is not None and unchanged.id == first.id
    assert first.status == AttachmentStatus.READY.value

    profile_service.set_profile_attachment(session, context, second.id)
    assert second.space_id is None
    assert first.status == AttachmentStatus.DELETING.value

    assert attachment_service.purge(session, first)
    assert not store.exists(build_account_storage_key(anna.id, first.id))
    # The purged row no longer knows its origin Space; the durable origin
    # cleanup queued at adoption still removes that object.
    assert run_origin_cleanup_jobs(session) == 2
    assert not store.exists(build_storage_key(space.id, first.id))

    # Removal keeps using the same DELETING lifecycle for the adopted row.
    assert profile_service.set_profile_attachment(session, context, None) is None
    assert second.status == AttachmentStatus.DELETING.value


def test_adoption_is_idempotent_and_leaves_no_storage_home_behind(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A retried adoption converges, and an abandoned copy is still collected."""
    store = local_store(tmp_path, monkeypatch)

    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    session.flush()

    attachment = uploaded_image(session, store, account_id=anna.id, space_id=space.id)
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=anna.id,
            attachment_id=attachment.id,
        )
    )
    session.flush()

    assert account_media.adopt(session, attachment) is True
    assert account_media.adopt(session, attachment) is False
    assert account_media.adopt_if_account_profile(session, attachment) is False
    assert (
        session.execute(
            select(func.count(Job.id)).where(Job.kind == account_media.ORIGIN_CLEANUP_JOB)
        ).scalar_one()
        == 1
    )

    # Replaying the origin cleanup is safe: an already removed object is not an
    # error, so a redelivered job cannot fail the queue.
    run_origin_cleanup_jobs(session)
    run_origin_cleanup_jobs(session)
    assert not store.exists(build_storage_key(space.id, attachment.id))

    # A copy left behind by a transaction that rolled back after copying belongs
    # to a row that is still Space-owned. Purging that row must remove both
    # possible homes so no object outlives its authoritative parent.
    abandoned = uploaded_image(session, store, account_id=anna.id, space_id=space.id)
    orphan_key = build_account_storage_key(anna.id, abandoned.id)
    store.copy(build_storage_key(space.id, abandoned.id), orphan_key, "image/jpeg")

    attachment_service.mark_for_deletion(session, abandoned)
    assert attachment_service.purge(session, abandoned)
    assert not store.exists(orphan_key)
    assert not store.exists(build_storage_key(space.id, abandoned.id))


def test_adoption_without_provider_object_still_frees_the_row(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing bytes cannot be preserved, but the row must still leave the Space."""
    store = local_store(tmp_path, monkeypatch)

    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    session.flush()

    attachment = uploaded_image(session, store, account_id=anna.id, space_id=space.id)
    store.delete(build_storage_key(space.id, attachment.id))
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=anna.id,
            attachment_id=attachment.id,
        )
    )
    session.flush()

    assert account_media.adopt_if_account_profile(session, attachment) is True
    assert attachment.space_id is None
    assert not store.exists(build_account_storage_key(anna.id, attachment.id))
