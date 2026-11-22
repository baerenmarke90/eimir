"""Server-authoritative Account deletion core lifecycle."""

from __future__ import annotations

from datetime import date, time, timedelta
from pathlib import Path
from runpy import run_path
from typing import Any
from uuid import UUID, uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from eimir_pro.garden.models import GardenPlant, GardenReader, GardenWatering
from eimir_pro.once_messages.models import OnceDevice, OnceReception
from eimir_pro.partner_quick_actions.models import SupportGestureRequest
from eimir_pro.partner_quick_actions.service import send_support_gesture
from eimir_pro.presence.models import (
    PartnerLocationConsent,
    PresenceDeviceCredential,
    PresencePositionPayload,
    PresenceSnapshot,
)
from eimir_pro.quotes.models import DailyQuotePreference
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.api.authors import resolve_author_summary
from eimir.auth import sessions
from eimir.auth.recent_auth_models import (
    RecentAuthenticationGrant,
    RecentAuthenticationOidcRequest,
    RecentAuthenticationWebAuthnChallenge,
)
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.core.errors import UnauthenticatedError
from eimir.daily_checkins.models import (
    DailyCheckIn,
    DailyInsightFeedback,
    RecommendationKey,
    RecommendationRating,
)
from eimir.dashboard.models import DashboardModulePreference
from eimir.engagement.models import (
    Notification,
    NotificationChannel,
    NotificationKind,
    NotificationPreference,
    PushEndpoint,
    SupportGestureKind,
    ThinkingOfYouRequest,
)
from eimir.engagement.push import register_endpoint
from eimir.engagement.thinking import send as send_thinking_of_you
from eimir.identity.deletion import (
    DELETED_ACCOUNT_DISPLAY_NAME,
    DELETED_ACCOUNT_LOCALE,
    DELETED_ACCOUNT_TIMEZONE,
    PERSONAL_ACCOUNT_ROWS,
    DeletionNotAcceptedError,
    apply_accepted_tombstone,
    apply_core_cleanup,
    mark_deletion_failed,
)
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import AccountEmail, AuthIdentity, AuthProvider, DeviceSession
from eimir.legal.models import TermsAcceptance, TermsAcceptanceOrigin
from eimir.legal.terms import record_acceptance
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
from eimir.relationship.models import Invitation, Membership, MembershipStatus, SpacePresence
from eimir.relationship.service import add_member
from eimir.wishes import service as wish_service
from eimir.wishes.models import WishReminder
from tests.conftest import make_account, make_space, requires_database
from tests.support.plugins import requires_pro

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
        sentiment=PreferenceSentiment.LIKE.value,
        visibility=ProfileVisibility.PRIVATE_PARTNER_NOTE.value,
        payload=ProfilePreferencePayload(value=value, topic="account-deletion-test"),
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
    for owner in (account, partner):
        record_acceptance(
            session,
            account_id=owner.id,
            version="test-terms",
            origin=TermsAcceptanceOrigin.SIGNUP_REQUEST,
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
    assert _count(session, TermsAcceptance, TermsAcceptance.account_id == account.id) == 0
    assert _count(session, TermsAcceptance, TermsAcceptance.account_id == partner.id) == 1
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


@pytest.mark.parametrize(
    ("completed_backup", "plugin_loaded"),
    [
        pytest.param(False, True, marks=requires_pro),
        pytest.param(True, True, marks=requires_pro),
        (False, False),
    ],
)
def test_private_account_rows_are_removed_without_erasing_partner_data(
    session: Session, completed_backup: bool, plugin_loaded: bool
) -> None:
    from contextlib import nullcontext

    from eimir.pro_plugin import personal_account_models
    from tests.support.plugins import without_plugins

    owner, partner = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)
    at = now()
    expiry = at + timedelta(minutes=10)
    plant = GardenPlant(
        space_id=space.id,
        sender_id=owner.id,
        receiver_id=partner.id,
        species="POPPY",
        sent_on=at.date(),
    )
    session.add(plant)
    wish = wish_service.create_wish(
        session,
        AuthorizationContext(account_id=owner.id, space_id=space.id),
        title="Shared fixture",
    )
    session.flush()
    plant_id = plant.id
    for person, recipient in ((owner, partner), (partner, owner)):
        keys = {"space_id": space.id, "account_id": person.id}
        device_session, _ = sessions.start_session(session, person)
        session.flush()
        auth_keys = {
            "account_id": person.id,
            "device_session_id": device_session.id,
            "purpose": "account_deletion",
            "expires_at": expiry,
        }
        membership = session.scalars(select(Membership).filter_by(**keys)).one()
        session.add_all(
            [
                DailyCheckIn(**keys, checked_on=at.date(), vibe="GOOD"),
                DailyInsightFeedback(
                    **keys,
                    recommendation_key=RecommendationKey.QUIET_TIME.value,
                    rating=RecommendationRating.HELPFUL.value,
                ),
                DailyQuotePreference(account_id=person.id),
                DashboardModulePreference(**keys, module_key="fixture"),
                GardenReader(**keys),
                GardenWatering(**keys, plant_id=plant.id, watered_on=at.date()),
                NotificationPreference(
                    account_id=person.id,
                    kind=next(iter(NotificationKind)).value,
                    channel=next(iter(NotificationChannel)).value,
                    enabled=True,
                ),
                OnceDevice(
                    **keys,
                    id=uuid4(),
                    membership_id=membership.id,
                    public_jwk={"kty": "EC"},
                    created_at=at,
                ),
                OnceReception(**keys, membership_id=membership.id),
                PartnerLocationConsent(
                    **keys,
                    recipient_account_id=recipient.id,
                    level="DISTANCE",
                    indefinite=True,
                    precision="PRECISE",
                ),
                PresenceDeviceCredential(
                    **keys,
                    device_id=uuid4(),
                    device_session_id=device_session.id,
                    token_hash=uuid4().hex * 2,
                    consent_generation=1,
                    expires_at=expiry,
                ),
                PresenceSnapshot(
                    **keys,
                    captured_at=at,
                    expires_at=expiry,
                    consent_generation=1,
                    payload=PresencePositionPayload(latitude=0, longitude=0, accuracy_meters=1000),
                ),
                RecentAuthenticationGrant(**auth_keys, method="LOCAL_PASSWORD", achieved_at=at),
                RecentAuthenticationOidcRequest(
                    **auth_keys,
                    connection_id="fixture",
                    state_hash=uuid4().hex,
                    redirect_uri="https://example.test/return",
                ),
                RecentAuthenticationWebAuthnChallenge(**auth_keys, challenge=uuid4().bytes),
                SpacePresence(**keys, last_active_at=at),
                WishReminder(**keys, wish_id=wish.id, due_at=expiry),
            ]
        )
    session.flush()
    if completed_backup:
        # Reconstruct the persisted state without invoking today's membership
        # hooks. Restored historical rows must be handled by the migration itself.
        owner.disabled_at = at
        session.add(
            AccountDeletion(
                account_id=owner.id,
                accepted_at=at,
                completed_at=at,
                status=AccountDeletionStatus.COMPLETED.value,
            )
        )
        session.flush()
        script = (
            Path(__file__).resolve().parents[2]
            / "alembic/versions/0163_completed_account_private_data.py"
        )
        with Operations.context(MigrationContext.configure(session.connection())):
            for _ in range(2):
                run_path(str(script))["upgrade"]()
    else:
        assert apply_accepted_tombstone(session, owner.id, accepted_at=at) is not None
        # Without the plugin, Core's manifest rules remove the plugin rows.
        with nullcontext() if plugin_loaded else without_plugins():
            for _ in range(2):
                apply_core_cleanup(session, owner.id)
    session.expire_all()
    for table in (*PERSONAL_ACCOUNT_ROWS, *personal_account_models()):
        assert _count(session, table, table.account_id == owner.id) == 0, table.__tablename__
        # Revoking the surviving owner's grant also removes its location and publish credential.
        pair_runtime = (GardenReader, GardenWatering, OnceDevice, OnceReception)
        expected = (
            0
            if table in (PresenceSnapshot, PresenceDeviceCredential)
            or (not completed_backup and table in pair_runtime)
            # Core-only deletes the consents the deleted Account had received.
            or (not plugin_loaded and table is PartnerLocationConsent)
            else 1
        )
        assert _count(session, table, table.account_id == partner.id) == expected, (
            table.__tablename__
        )
    # Pair-bound game state ends on membership exit. The shared Wish survives.
    assert (session.get(GardenPlant, plant_id) is not None) == completed_backup
    assert session.get(type(wish), wish.id) is not None
    if not plugin_loaded:
        assert session.scalars(select(PartnerLocationConsent)).first() is None
        return
    other = session.scalars(select(PartnerLocationConsent)).one()
    assert (other.level, other.recipient_account_id, other.precision, other.generation) == (
        "OFF",
        None,
        "PRECISE",
        2,
    )


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


@pytest.mark.parametrize(
    ("deleted_party", "plugin_loaded"),
    [
        pytest.param("sender", True, marks=requires_pro),
        pytest.param("recipient", True, marks=requires_pro),
        ("sender", False),
        ("recipient", False),
    ],
)
def test_core_cleanup_removes_partner_gesture_receipts_of_the_deleted_account(
    session: Session, deleted_party: str, plugin_loaded: bool
) -> None:
    # Gesture receipts record who sent which gesture to whom and when. They are
    # relationship metadata, not shared history, so they must not outlive the
    # Account on either side. Pseudonymising the Account never fires the
    # ON DELETE CASCADE, so the cleanup has to delete them explicitly: the Pro
    # plugin's account hook when it is loaded, the Core manifest otherwise
    # (an instance that once ran with the plugin).
    from contextlib import nullcontext

    from tests.support.plugins import plugins_loaded, without_plugins

    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    ben = make_account(session, "Ben")
    add_member(session, space.id, ben)
    session.flush()

    context = AuthorizationContext(account_id=anna.id, space_id=space.id)
    send_thinking_of_you(session, context, client_request_id=uuid4())
    send_support_gesture(
        session,
        context,
        kind=SupportGestureKind.KISS,
        client_request_id=uuid4(),
    )
    session.flush()

    in_space = (
        _count(session, ThinkingOfYouRequest, ThinkingOfYouRequest.space_id == space.id),
        _count(session, SupportGestureRequest, SupportGestureRequest.space_id == space.id),
    )
    assert in_space == (1, 1)

    deleted = anna if deleted_party == "sender" else ben
    core_only = nullcontext() if plugin_loaded or not plugins_loaded() else without_plugins()
    with core_only:
        apply_accepted_tombstone(session, deleted.id, accepted_at=now())
        apply_core_cleanup(session, deleted.id)

    assert _count(session, ThinkingOfYouRequest, ThinkingOfYouRequest.space_id == space.id) == 0
    assert _count(session, SupportGestureRequest, SupportGestureRequest.space_id == space.id) == 0
