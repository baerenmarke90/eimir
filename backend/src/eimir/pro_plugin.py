"""The in-tree Pro plugin object (Decision 0017, Phase 1).

The Premium-only modules still live in this distribution. This object is what
Core sees of them through the seam; it is registered as the entry point ``pro``
of the group ``eimir.plugins`` in ``pyproject.toml``. It names its model
modules as strings and imports Pro code only inside its hooks, so loading the
plugin imports no Pro module before a hook runs.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import and_, delete, or_, select

from eimir.deployment.revision import build_revision
from eimir.engagement.models import EngagementTarget, NotificationKind
from eimir.plugins.contract import (
    PLUGIN_SEAM_VERSION,
    AttachmentReadRule,
    CoreNotifications,
    TargetRule,
)
from eimir.plugins.manifest import PLUGIN_CAPABILITIES

if TYPE_CHECKING:
    from fastapi import APIRouter
    from sqlalchemy import ColumnElement
    from sqlalchemy.orm import Session

    from eimir.authorization import AuthorizationContext
    from eimir.domain.events import EventType
    from eimir.jobs.worker import JobRegistry
    from eimir.outbox.models import OutboxEvent
    from eimir.transfer.models import TransferScope

# Every capability the Core manifest leaves to plugins is implemented here.
_CAPABILITIES = PLUGIN_CAPABILITIES

_MODEL_MODULES = (
    "eimir.calendar_sync.models",
    "eimir.couple_games.models",
    "eimir.garden.models",
    "eimir.heart_hunt.models",
    "eimir.once_messages.models",
    "eimir.photo_sources.models",
    "eimir.picture_ping_pong.models",
    "eimir.presence.models",
    "eimir.quotes.models",
)

# Remote couple games share one notice kind; the target names the game.
_COUPLE_GAME_TARGETS = {
    EngagementTarget.WHO_OF_US_GAME: "WHO_OF_US",
    EngagementTarget.WISH_DETECTIVE_GAME: "WISH_DETECTIVE",
    EngagementTarget.OUR_MOMENTS_GAME: "OUR_MOMENTS",
}


def _once_message_is_available(
    session: Session, context: AuthorizationContext, target_id: Any, kind: Any
) -> ColumnElement[bool]:
    from eimir.once_messages import service as once_messages
    from eimir.once_messages.models import OnceMessage

    del session, kind
    return (
        select(OnceMessage.id)
        .where(OnceMessage.id == target_id, once_messages.available_predicate(context))
        .exists()
    )


def _garden_seed_is_waiting(
    session: Session, context: AuthorizationContext, target_id: Any, kind: Any
) -> ColumnElement[bool]:
    # A seed notice is current only while the seed waits for the reader.
    from eimir.garden import service as garden

    del kind
    return garden.seed_is_waiting(session, context, target_id).exists()


def _garden_bouquet_is_open(
    session: Session, context: AuthorizationContext, target_id: Any, kind: Any
) -> ColumnElement[bool]:
    # A bouquet notice is current only while its card waits for the reader.
    from eimir.garden import service as garden

    del kind
    return garden.bouquet_is_open(session, context, target_id).exists()


def _picture_is_current(
    session: Session, context: AuthorizationContext, target_id: Any, kind: Any
) -> ColumnElement[bool]:
    # A turn notice is current only while it is still the recipient's turn; a
    # finished notice only while that picture is finished (not restarted).
    from eimir.picture_ping_pong.models import PicturePingPong, PictureStatus

    del session
    turn = (
        select(PicturePingPong.id)
        .where(
            PicturePingPong.id == target_id,
            PicturePingPong.space_id == context.space_id,
            PicturePingPong.status == PictureStatus.DRAWING.value,
            PicturePingPong.drawer_id == context.account_id,
        )
        .exists()
    )
    finished = (
        select(PicturePingPong.id)
        .where(
            PicturePingPong.id == target_id,
            PicturePingPong.space_id == context.space_id,
            PicturePingPong.status == PictureStatus.FINISHED.value,
        )
        .exists()
    )
    if kind is None:
        return turn
    if isinstance(kind, NotificationKind):
        return finished if kind is NotificationKind.PICTURE_PING_PONG_FINISHED else turn
    return or_(
        and_(kind != NotificationKind.PICTURE_PING_PONG_FINISHED.value, turn),
        and_(kind == NotificationKind.PICTURE_PING_PONG_FINISHED.value, finished),
    )


def _couple_game_is_current(game: str) -> TargetRule:
    def rule(
        session: Session, context: AuthorizationContext, target_id: Any, kind: Any
    ) -> ColumnElement[bool]:
        # A game notice is current only while the game still waits on the reader.
        from eimir.couple_games import service as couple_games
        from eimir.couple_games.models import CoupleGameKind

        del session, kind
        return couple_games.notice_is_current(context, target_id, CoupleGameKind[game]).exists()

    return rule


_ENGAGEMENT_TARGETS: dict[EngagementTarget, TargetRule] = {
    EngagementTarget.ONCE_MESSAGE: _once_message_is_available,
    EngagementTarget.GARDEN_SEED: _garden_seed_is_waiting,
    EngagementTarget.GARDEN_BOUQUET: _garden_bouquet_is_open,
    EngagementTarget.PICTURE_GAME: _picture_is_current,
    **{target: _couple_game_is_current(game) for target, game in _COUPLE_GAME_TARGETS.items()},
}


def _heart_hunt_photo_is_readable(
    session: Session, context: AuthorizationContext, parent_id: UUID
) -> bool:
    # Exactly the two partners of the round, never decided by the uploader alone.
    from eimir.heart_hunt import service as heart_hunt

    return heart_hunt.can_read_photo(session, context, parent_id)


_ATTACHMENT_READ_RULES: dict[str, AttachmentReadRule] = {
    "HEART_HUNT_ROUND": _heart_hunt_photo_is_readable,
}


def _project_notification(
    session: Session,
    event: OutboxEvent,
    event_type: EventType,
    core: CoreNotifications,
) -> bool:
    from eimir.domain.events import EventType

    if event_type is EventType.ONCE_MESSAGE_SENT:
        core.project_target_notification(
            session,
            event,
            EngagementTarget.ONCE_MESSAGE,
            event.subject_id,
            NotificationKind.ONCE_MESSAGE_RECEIVED,
            expires_at=event.payload.due_at,
        )
        core.ensure_push_deliveries(session, event)
        return True

    if event_type in {EventType.HEART_HUNT_HIDDEN, EventType.HEART_HUNT_FOUND}:
        # No target row: the notice only names the partner and opens the game, so
        # it never carries or exposes the photo or the round state.
        core.project_target_notification(
            session, event, None, None, NotificationKind(event_type.value)
        )
        core.ensure_push_deliveries(session, event)
        return True

    if event_type in {EventType.GARDEN_SEED_ARRIVED, EventType.GARDEN_BOUQUET_GIVEN}:
        from eimir.garden import service as garden

        recipient = event.payload.recipient_id
        # A bouquet reuses the seed notice with its own target and text; the
        # couple gets at most one garden notice per person and local day.
        if recipient is None or not garden.notice_taken_today(
            session,
            event.space_id,
            recipient,
            event.created_at,
            NotificationKind.GARDEN_SEED_ARRIVED.value,
        ):
            core.project_target_notification(
                session,
                event,
                EngagementTarget.GARDEN_SEED
                if event_type is EventType.GARDEN_SEED_ARRIVED
                else EngagementTarget.GARDEN_BOUQUET,
                event.subject_id,
                NotificationKind.GARDEN_SEED_ARRIVED,
            )
    elif event_type is EventType.PICTURE_PING_PONG_TURN:
        core.project_target_notification(
            session,
            event,
            EngagementTarget.PICTURE_GAME,
            event.subject_id,
            NotificationKind.PICTURE_PING_PONG_TURN,
        )
    elif event_type is EventType.PICTURE_PING_PONG_FINISHED:
        core.project_target_notification(
            session,
            event,
            EngagementTarget.PICTURE_GAME,
            event.subject_id,
            NotificationKind.PICTURE_PING_PONG_FINISHED,
        )
    elif event_type is EventType.COUPLE_GAME_TURN:
        from eimir.couple_games import service as couple_games
        from eimir.couple_games.models import CoupleGameKind

        subjects = {
            couple_games.SUBJECT_TYPES[CoupleGameKind[game]]: target
            for target, game in _COUPLE_GAME_TARGETS.items()
        }
        game_target = subjects.get(event.subject_type)
        if game_target is not None:
            core.project_target_notification(
                session,
                event,
                game_target,
                event.subject_id,
                NotificationKind.COUPLE_GAME_TURN,
            )
    else:
        return False
    core.ensure_push_deliveries(session, event)
    core.ensure_email_deliveries(session, event)
    return True


def personal_account_models() -> tuple[Any, ...]:
    """Pro models whose rows of a deleted Account are deleted by ``account_id``."""
    from eimir.garden.models import GardenReader, GardenWatering
    from eimir.once_messages.models import OnceDevice, OnceReception
    from eimir.presence.models import (
        PartnerLocationConsent,
        PresenceDeviceCredential,
        PresenceSnapshot,
    )
    from eimir.quotes.models import DailyQuotePreference

    return (
        DailyQuotePreference,
        GardenReader,
        GardenWatering,
        OnceDevice,
        OnceReception,
        PresenceDeviceCredential,
        PresenceSnapshot,
        PartnerLocationConsent,
    )


def _delete_account_rows(session: Session, model: Any, account_id: UUID) -> None:
    session.execute(delete(model).where(model.account_id == account_id))


def _on_account_deleted(session: Session, account_id: UUID) -> None:
    from eimir.calendar_sync.models import CalendarConnection, CalendarOAuthTransaction
    from eimir.photo_sources.models import GoogleAccountHint, PhotoConnection, PhotoSelection
    from eimir.presence.models import PartnerLocationConsent, SharingLevel
    from eimir.presence.service import delete_owner_presence

    for model in personal_account_models():
        _delete_account_rows(session, model, account_id)
    # A remaining partner keeps their preferences, but their old grant cannot
    # authorize this recipient or be silently transferred to another partner.
    received = session.scalars(
        select(PartnerLocationConsent)
        .where(PartnerLocationConsent.recipient_account_id == account_id)
        .with_for_update()
    )
    for consent in received:
        delete_owner_presence(session, consent.space_id, consent.account_id)
        consent.recipient_account_id = None
        consent.level = SharingLevel.OFF.value
        consent.indefinite = False
        consent.expires_at = None
        consent.suspended_at = None
        consent.generation += 1
    _delete_account_rows(session, PhotoSelection, account_id)
    _delete_account_rows(session, PhotoConnection, account_id)
    _delete_account_rows(session, GoogleAccountHint, account_id)
    # Calendar credentials go with the Account; sponsored Space targets cascade.
    _delete_account_rows(session, CalendarConnection, account_id)
    _delete_account_rows(session, CalendarOAuthTransaction, account_id)


class InTreeProPlugin:
    """The Pro plugin while its code is part of the ``eimir`` distribution."""

    name = "pro"
    seam_version = PLUGIN_SEAM_VERSION

    @property
    def core_revision(self) -> str:
        # Built from the same tree as Core, so it is Core's own revision.
        return build_revision()

    def capabilities(self) -> frozenset[str]:
        return _CAPABILITIES

    def model_modules(self) -> Sequence[str]:
        return _MODEL_MODULES

    def routers(self) -> Sequence[APIRouter]:
        from eimir.api.v1 import (
            calendar_sync,
            couple_games,
            daily_quote,
            date_ideas,
            games,
            garden,
            heart_hunt,
            once_messages,
            partner_location,
            photo_sources,
            picture_ping_pong,
        )

        return (
            photo_sources.router,
            calendar_sync.router,
            once_messages.router,
            partner_location.router,
            daily_quote.router,
            date_ideas.router,
            games.router,
            garden.router,
            heart_hunt.router,
            picture_ping_pong.router,
            couple_games.router,
        )

    def register_jobs(self, registry: JobRegistry) -> None:
        from eimir.calendar_sync import jobs as calendar_sync_jobs
        from eimir.heart_hunt import retention as heart_hunt_retention
        from eimir.once_messages import service as once_messages
        from eimir.photo_sources import retention as photo_source_retention
        from eimir.presence import retention as presence_retention

        photo_source_retention.register_handlers(registry)
        once_messages.register_handlers(registry)
        heart_hunt_retention.register_handlers(registry)
        presence_retention.register_handlers(registry)
        calendar_sync_jobs.register_handlers(registry)

    def ensure_scheduled(self, session: Session) -> None:
        from eimir.heart_hunt import retention as heart_hunt_retention
        from eimir.photo_sources import retention as photo_source_retention
        from eimir.presence import retention as presence_retention

        heart_hunt_retention.ensure_scheduled(session)
        presence_retention.ensure_scheduled(session)
        photo_source_retention.ensure_scheduled(session)

    def prune_expired(self, session: Session) -> None:
        from eimir.once_messages.service import prune_expired

        prune_expired(session)

    def on_outbox_event(self, session: Session, event: OutboxEvent, event_type: EventType) -> None:
        # Calendar sync (#1895) reads the current Plan later in its own job, so it
        # only schedules work here and never depends on notification eligibility.
        from eimir.calendar_sync import service as calendar_sync

        calendar_sync.on_outbox_event(session, event, event_type)

    def project_notification(
        self,
        session: Session,
        event: OutboxEvent,
        event_type: EventType,
        core: CoreNotifications,
    ) -> bool:
        return _project_notification(session, event, event_type, core)

    def engagement_targets(self) -> Mapping[EngagementTarget, TargetRule]:
        return _ENGAGEMENT_TARGETS

    def attachment_read_rules(self) -> Mapping[str, AttachmentReadRule]:
        return _ATTACHMENT_READ_RULES

    def on_partner_joined(self, session: Session, space_id: UUID) -> None:
        from eimir.couple_games import service as couple_games
        from eimir.garden import service as garden
        from eimir.picture_ping_pong import service as picture_ping_pong

        picture_ping_pong.purge_space(session, space_id)
        couple_games.purge_space(session, space_id)
        garden.purge_space(session, space_id)

    def on_membership_ended(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        from eimir.couple_games import service as couple_games
        from eimir.garden import service as garden
        from eimir.heart_hunt import service as heart_hunt
        from eimir.once_messages import service as once_messages
        from eimir.picture_ping_pong import service as picture_ping_pong

        del account_id
        once_messages.purge_space(session, space_id)
        heart_hunt.purge_space(session, space_id)
        picture_ping_pong.purge_space(session, space_id)
        couple_games.purge_space(session, space_id)
        garden.purge_space(session, space_id)

    def on_member_left(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        # The leaving sponsor's credentials stop writing this Space's calendar (#1895).
        from eimir.calendar_sync import service as calendar_sync

        calendar_sync.on_membership_ended(session, account_id, space_id)

    def on_account_deleted(self, session: Session, account_id: UUID) -> None:
        _on_account_deleted(session, account_id)

    def export_account_document(
        self,
        session: Session,
        authorization: AuthorizationContext,
        scope: TransferScope,
    ) -> Mapping[str, Any]:
        from eimir.photo_sources.models import GoogleAccountHint, PhotoConnection
        from eimir.transfer.models import TransferScope

        document: dict[str, Any] = {}
        if scope is not TransferScope.PERSONAL:
            return document
        connections = session.scalars(
            select(PhotoConnection).where(PhotoConnection.account_id == authorization.account_id)
        ).all()
        document["personalPhotoSources"] = [
            {"source": row.provider, "origin": row.payload.origin}
            for row in connections
            if row.payload.account_id == authorization.account_id
        ]
        google_account = session.scalar(
            select(GoogleAccountHint).where(
                GoogleAccountHint.account_id == authorization.account_id
            )
        )
        if google_account and google_account.payload.account_id == authorization.account_id:
            document["personalGoogleAccountHint"] = google_account.payload.email
        return document


plugin = InTreeProPlugin()
