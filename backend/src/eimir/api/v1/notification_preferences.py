"""Own-Account notification choices and truthful channel capabilities."""

from __future__ import annotations

from fastapi import APIRouter, Response
from pydantic import ConfigDict
from sqlalchemy import select

from eimir.api.deps import CurrentAccount, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import ConflictError, ErrorCode
from eimir.engagement import notification_policy, notification_preferences
from eimir.engagement.models import NotificationChannel, NotificationKind, PushEndpoint

router = APIRouter(prefix="/notification-preferences", tags=["notifications"])


class NotificationChannelPreference(ApiModel):
    channel: NotificationChannel
    enabled: bool
    configurable: bool


class NotificationPreferenceEntry(ApiModel):
    kind: NotificationKind
    delivery_class: notification_policy.DeliveryClass
    channels: list[NotificationChannelPreference]


class NotificationChannelCapability(ApiModel):
    channel: NotificationChannel
    available: bool
    reason: str | None


class NotificationPreferencesView(ApiModel):
    catalog_version: int
    items: list[NotificationPreferenceEntry]
    capabilities: list[NotificationChannelCapability]


class NotificationPreferenceUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class NotificationPreferenceUpdated(ApiModel):
    kind: NotificationKind
    channel: NotificationChannel
    enabled: bool


@router.get(
    "",
    response_model=NotificationPreferencesView,
    operation_id="getOwnNotificationPreferences",
    responses=problem_responses(401, 503),
)
def get_own_notification_preferences(
    account: CurrentAccount, session: DbSession, response: Response
) -> NotificationPreferencesView:
    """Keep persisted choice, policy eligibility and transport readiness distinct."""
    choices = notification_preferences.own_push_choices(session, account_id=account.id)
    active_endpoint = session.execute(
        select(PushEndpoint.id)
        .where(PushEndpoint.account_id == account.id, PushEndpoint.disabled_at.is_(None))
        .limit(1)
    ).scalar_one_or_none()
    response.headers["Cache-Control"] = "private, no-store"
    return NotificationPreferencesView(
        catalog_version=notification_policy.POLICY_VERSION,
        items=[
            NotificationPreferenceEntry(
                kind=kind,
                delivery_class=notification_policy.POLICIES[kind].delivery_class,
                channels=[
                    NotificationChannelPreference(
                        channel=NotificationChannel.IN_APP, enabled=True, configurable=False
                    ),
                    NotificationChannelPreference(
                        channel=NotificationChannel.PUSH,
                        enabled=choices[kind],
                        configurable=notification_policy.POLICIES[kind].push_immediately,
                    ),
                    NotificationChannelPreference(
                        channel=NotificationChannel.EMAIL, enabled=False, configurable=False
                    ),
                ],
            )
            for kind in NotificationKind
        ],
        capabilities=[
            NotificationChannelCapability(
                channel=NotificationChannel.IN_APP, available=True, reason=None
            ),
            NotificationChannelCapability(
                channel=NotificationChannel.PUSH,
                available=False,
                reason=(
                    "PUSH_ENDPOINT_MISSING"
                    if active_endpoint is None
                    else "PUSH_TRANSPORT_NOT_READY"
                ),
            ),
            NotificationChannelCapability(
                channel=NotificationChannel.EMAIL,
                available=False,
                reason="EMAIL_DELIVERY_NOT_IMPLEMENTED",
            ),
        ],
    )


@router.patch(
    "/{kind}/{channel}",
    response_model=NotificationPreferenceUpdated,
    operation_id="updateOwnNotificationPreference",
    responses=problem_responses(401, 409, 422, 503),
)
def update_own_notification_preference(
    kind: NotificationKind,
    channel: NotificationChannel,
    body: NotificationPreferenceUpdate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> NotificationPreferenceUpdated:
    """Change only the authenticated recipient's implemented PUSH choice."""
    if channel is not NotificationChannel.PUSH:
        raise ConflictError(
            "This notification channel is not configurable yet.",
            ErrorCode.NOTIFICATION_CHANNEL_NOT_CONFIGURABLE,
        )
    if not notification_policy.POLICIES[kind].push_immediately:
        raise ConflictError(
            "Immediate push is not allowed for this notification kind.",
            ErrorCode.NOTIFICATION_PUSH_NOT_ALLOWED,
        )
    try:
        notification_preferences.set_push_enabled(
            session, account_id=account.id, kind=kind, enabled=body.enabled
        )
    except ValueError as exc:
        raise ConflictError(
            "The Account is unavailable for notification changes.",
            ErrorCode.NOTIFICATION_PREFERENCE_ACCOUNT_UNAVAILABLE,
        ) from exc
    response.headers["Cache-Control"] = "private, no-store"
    return NotificationPreferenceUpdated(kind=kind, channel=channel, enabled=body.enabled)
