"""Server-authoritative Account deletion core lifecycle."""

from __future__ import annotations

from datetime import date, time, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.api.authors import resolve_author_summary
from eimir.auth import sessions
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.core.errors import UnauthenticatedError
from eimir.engagement.models import Notification, NotificationKind, PushEndpoint
from eimir.engagement.push import register_endpoint
from eimir.identity.deletion import (
    DELETED_ACCOUNT_DISPLAY_NAME,
    DELETED_ACCOUNT_LOCALE,
    DELETED_ACCOUNT_TIMEZONE,
    DeletionNotAcceptedError,
    apply_accepted_tombstone,
    apply_core_cleanup,
    mark_deletion_failed,
)
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import AccountEmail, AuthIdentity, AuthProvider, DeviceSession
from eimir.memories.models import Memory, MemoryPayload
from eimir.private_notes.models import PrivateNote, PrivateNotePayload
from eimir.profiles.models import (
    PartnerProfile,
    PreferenceCategory,
    PreferenceSentiment,
    ProfilePreference,
    ProfilePreferencePayload,
    ProfileVisibility,
)
from eimir.relationship.models import Invitation, Membership, MembershipStatus
from eimir.relationship.service import add_member
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _count(session: Session, model: type[Any], *conditions: Any) -> int:
    statement = select(func.count()).select_from(model)
    if conditions:
        statement = statement.where(*conditions)
    return session.execute(statement).scalar_one()


def _private_note(
    session: Session,
    *,
    owner_id: UUID,
    space_id: UUID,
    title: str,
) -> PrivateNote:
    note = PrivateNote(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        pinned=False,
        payload=PrivateNotePayload(title=title, body="private"),
    )
    session.add(note)
    session.flush()
    return note


def _private_partner_note(
    session: Session,
    *,
    owner_id: UUID,
    subject_id: UUID,
    space_id: UUID,
    value: str,
) -> ProfilePreference:
    preference = ProfilePreference(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        profile_id=None,
        account_id=subject_id,
        category=PreferenceCategory.OTHER.value,
        topic="account-deletion-test",
        sentiment=PreferenceSentiment.LIKE.value,
        visibility=ProfileVisibility.PRIVATE_PARTNER_NOTE.value,
        payload=ProfilePreferencePayload(value=value),
    )
    session.add(preference)
    session.flush()
    return preference


def test_accepted_tombstone_is_immediately_fail_closed_and_idempotent(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    membership = session.execute(
        select(Membership).where(
            Membership.account_id == account.id,
            Membership.space_id == space.id,
        )
    ).scalar_one()
    device, issued = sessions.start_session(session, account, device_name="Pixel")
    endpoint = register_endpoint(
        session,
        account_id=account.id,
        provider_key="test",
        endpoint_value="endpoint://anna",
    )
    invitation = Invitation(
        space_id=space.id,
        created_by=account.id,
        token_hash="a" * 64,
        expires_at=now() + timedelta(hours=1),
    )
    session.add(invitation)
    session.flush()

    accepted_at = now()
    deletion = apply_accepted_tombstone(session, account.id, accepted_at=accepted_at)

    assert deletion is not None
    assert deletion.status == AccountDeletionStatus.PENDING.value
    assert deletion.accepted_at == accepted_at
    assert account.disabled_at == accepted_at
    assert membership.status == MembershipStatus.LEFT.value
    assert membership.ended_at == accepted_at
    assert device.revoked_at is not None
    assert device.access_token_hash is None
    assert endpoint.disabled_at == accepted_at
    assert invitation.revoked_at == accepted_at

    with pytest.raises(UnauthenticatedError):
        sessions.authenticate(session, issued.access_token)

    repeated = apply_accepted_tombstone(session, account.id, accepted_at=accepted_at)
    assert repeated is not None
    assert repeated.account_id == deletion.account_id
    assert membership.ended_at == accepted_at
    assert _count(session, AccountDeletion, AccountDeletion.account_id == account.id) == 1


def test_core_cleanup_deletes_private_identity_state_but_retains_shared_history(
    session: Session,
) -> None:
    account = make_account(session, "Anna")
    account.birthday = date(1990, 5, 1)
    account.locale = "fr-FR"
    account.timezone = "Europe/Paris"
    account.quiet_hours_start = time(22)
    account.quiet_hours_end = time(7)
    space = make_space(session, account)

    partner = make_account(session, "Ben")
    add_member(session, space.id, partner)

    shared_memory = Memory(
        space_id=space.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=MemoryPayload(title="Together", body="shared history"),
    )
    session.add(shared_memory)
    own_private = _private_note(
        session,
        owner_id=account.id,
        space_id=space.id,
        title="Anna only",
    )
    partner_private = _private_note(
        session,
        owner_id=partner.id,
        space_id=space.id,
        title="Ben only",
    )
    own_partner_note = _private_partner_note(
        session,
        owner_id=account.id,
        subject_id=partner.id,
        space_id=space.id,
        value="Anna private about Ben",
    )
    partner_note_about_deleted = _private_partner_note(
        session,
        owner_id=partner.id,
        subject_id=account.id,
        space_id=space.id,
        value="Ben private about Anna",
    )

    session.add_all(
        [
            AccountEmail(
                account_id=account.id,
                email="anna@example.test",
                is_primary=True,
                verified_at=now(),
            ),
            AuthIdentity(
                account_id=account.id,
                provider=AuthProvider.LOCAL_PASSWORD.value,
                subject="anna@example.test",
                secret_hash="derived-hash",
            ),
        ]
    )
    sessions.start_session(session, account)
    register_endpoint(
        session,
        account_id=account.id,
        provider_key="test",
        endpoint_value="endpoint://anna-delete",
    )

    session.add_all(
        [
            Notification(
                space_id=space.id,
                recipient_account_id=account.id,
                source_event_id=uuid4(),
                kind=NotificationKind.COMMENT_CREATED.value,
                actor_id=partner.id,
            ),
            Notification(
                space_id=space.id,
                recipient_account_id=partner.id,
                source_event_id=uuid4(),
                kind=NotificationKind.COMMENT_CREATED.value,
                actor_id=account.id,
            ),
        ]
    )
    session.flush()

    accepted_at = now()
    apply_accepted_tombstone(session, account.id, accepted_at=accepted_at)
    deletion = apply_core_cleanup(session, account.id)

    assert deletion is not None
    assert deletion.status == AccountDeletionStatus.PENDING.value
    assert deletion.completed_at is None

    # Shared history survives even though its original author deleted their Account.
    assert _count(session, Memory, Memory.id == shared_memory.id) == 1
    assert (
        _count(
            session,
            Memory,
            Memory.owner_id == account.id,
            Memory.privacy_class == PrivacyClass.SPACE_SHARED.value,
        )
        == 1
    )
    retained_author = resolve_author_summary(
        session,
        shared_memory.owner_id,
        resource="Memory author",
    )
    assert retained_author.is_former_member is True
    assert retained_author.display_name == ""
    assert retained_author.profile_attachment_id is None

    # Only the deleted owner's OWNER_ONLY data is removed.
    assert _count(session, PrivateNote, PrivateNote.id == own_private.id) == 0
    assert _count(session, PrivateNote, PrivateNote.id == partner_private.id) == 1
    assert _count(session, ProfilePreference, ProfilePreference.id == own_partner_note.id) == 0
    assert (
        _count(
            session,
            ProfilePreference,
            ProfilePreference.id == partner_note_about_deleted.id,
        )
        == 1
    )

    # Active profile/authentication/delivery state is not historical shared data.
    assert _count(session, PartnerProfile, PartnerProfile.owner_id == account.id) == 0
    assert _count(session, PartnerProfile, PartnerProfile.owner_id == partner.id) == 1
    assert _count(session, AccountEmail, AccountEmail.account_id == account.id) == 0
    assert _count(session, AuthIdentity, AuthIdentity.account_id == account.id) == 0
    assert _count(session, DeviceSession, DeviceSession.account_id == account.id) == 0
    assert _count(session, PushEndpoint, PushEndpoint.account_id == account.id) == 0
    assert (
        _count(
            session,
            Notification,
            Notification.recipient_account_id == account.id,
        )
        == 0
    )
    assert (
        _count(
            session,
            Notification,
            Notification.recipient_account_id == partner.id,
        )
        == 1
    )

    membership = session.execute(
        select(Membership).where(
            Membership.account_id == account.id,
            Membership.space_id == space.id,
        )
    ).scalar_one()
    assert membership.status == MembershipStatus.LEFT.value
    assert membership.ended_at == accepted_at

    assert account.display_name == DELETED_ACCOUNT_DISPLAY_NAME
    assert account.birthday is None
    assert account.locale == DELETED_ACCOUNT_LOCALE
    assert account.timezone == DELETED_ACCOUNT_TIMEZONE
    assert account.quiet_hours_start is None
    assert account.quiet_hours_end is None
    assert account.disabled_at == accepted_at
    assert not account.is_active

    # Repeating core cleanup converges without claiming full deletion completion.
    repeated = apply_core_cleanup(session, account.id)
    assert repeated is not None
    assert repeated.status == AccountDeletionStatus.PENDING.value
    assert repeated.completed_at is None
    assert repeated.account_id == deletion.account_id
    assert _count(session, Memory, Memory.id == shared_memory.id) == 1


def test_core_cleanup_requires_an_accepted_external_tombstone(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    note = _private_note(
        session,
        owner_id=account.id,
        space_id=space.id,
        title="must survive rejected cleanup",
    )

    with pytest.raises(DeletionNotAcceptedError):
        apply_core_cleanup(session, account.id)

    assert account.is_active
    assert _count(session, PrivateNote, PrivateNote.id == note.id) == 1
    assert _count(session, AccountDeletion, AccountDeletion.account_id == account.id) == 0


def test_failed_cleanup_stays_fail_closed_and_can_retry(session: Session) -> None:
    account = make_account(session, "Anna")
    make_space(session, account)
    _, issued = sessions.start_session(session, account)
    session.flush()

    accepted_at = now()
    deletion = apply_accepted_tombstone(session, account.id, accepted_at=accepted_at)
    assert deletion is not None

    failed = mark_deletion_failed(
        session,
        account.id,
        failure_code="provider said anna@example.test",
    )
    assert failed.status == AccountDeletionStatus.FAILED.value
    assert failed.failed_at is not None
    assert failed.last_failure_code == "DELETION_CLEANUP_FAILED"
    assert account.disabled_at == accepted_at
    with pytest.raises(UnauthenticatedError):
        sessions.authenticate(session, issued.access_token)

    retried = apply_accepted_tombstone(session, account.id, accepted_at=accepted_at)
    assert retried is not None
    assert retried.account_id == failed.account_id
    assert retried.status == AccountDeletionStatus.PENDING.value
    assert retried.failed_at is None
    assert retried.last_failure_code is None
    assert account.disabled_at == accepted_at
