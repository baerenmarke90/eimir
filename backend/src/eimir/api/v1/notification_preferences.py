"""Own-Account notification choices and truthful channel capabilities."""

from __future__ import annotations

from datetime import time

from fastapi import APIRouter, Response
from pydantic import ConfigDict, model_validator
from sqlalchemy import select

from eimir.api.deps import CurrentAccount, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import ConflictError, ErrorCode
from eimir.engagement import (
    email_delivery,
    notification_policy,
    notification_preferences,
    quiet_hours_preferences,
)
from eimir.engagement.models import NotificationChannel, NotificationKind, PushEndpoint
from eimir.engagement.quiet_hours import QuietHoursWindow
from eimir.identity.models import Account

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
    destination: str | None = None


class QuietHoursView(ApiModel):
    enabled: bool
    start: time | None
    end: time | None
    time_zone: str


class NotificationPreferencesView(ApiModel):
    catalog_version: int
    items: list[NotificationPreferenceEntry]
    capabilities: list[NotificationChannelCapability]
    quiet_hours: QuietHoursView


class QuietHoursUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    start: time | None = None
    end: time | None = None

    @model_validator(mode="after")
    def validate_window(self) -> QuietHoursUpdate:
        if not self.enabled:
            if self.start is not None or self.end is not None:
                raise ValueError("Disabled Quiet Hours cannot contain boundaries.")
        elif self.start is None or self.end is None:
            raise ValueError("Enabled Quiet Hours require both boundaries.")
        else:
            QuietHoursWindow(self.start, self.end)
        return self


def quiet_hours_view(account: Account) -> QuietHoursView:
    window = quiet_hours_preferences.own_window(account)
    return QuietHoursView(
        enabled=window is not None,
        start=window.start if window is not None else None,
        end=window.end if window is not None else None,
        time_zone=account.timezone,
    )


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
    push_choices = notification_preferences.own_push_choices(session, account_id=account.id)
    in_app_choices = notification_preferences.own_in_app_choices(session, account_id=account.id)
    email_choices = notification_preferences.own_email_choices(session, account_id=account.id)
    email_address = email_delivery.verified_primary_email(session, account.id)
    email_transport_ready = email_delivery.transport_available()
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
                        channel=NotificationChannel.IN_APP,
                        enabled=in_app_choices[kind],
                        configurable=True,
                    ),
                    NotificationChannelPreference(
                        channel=NotificationChannel.PUSH,
                        enabled=push_choices[kind],
                        configurable=notification_policy.POLICIES[kind].push_immediately,
                    ),
                    NotificationChannelPreference(
                        channel=NotificationChannel.EMAIL,
                        enabled=email_choices[kind],
                        configurable=(
                            notification_policy.POLICIES[kind].push_immediately
                            and (
                                (email_transport_ready and email_address is not None)
                                or email_choices[kind]
                            )
                        ),
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
                available=email_transport_ready and email_address is not None,
                reason=(
                    None
                    if email_transport_ready and email_address is not None
                    else "EMAIL_TRANSPORT_UNAVAILABLE"
                    if not email_transport_ready
                    else "EMAIL_VERIFIED_PRIMARY_MISSING"
                ),
                destination=email_address,
            ),
        ],
        quiet_hours=quiet_hours_view(account),
    )


@router.patch(
    "/quiet-hours",
    response_model=QuietHoursView,
    operation_id="updateOwnQuietHours",
    responses=problem_responses(401, 409, 422, 503),
)
def update_own_quiet_hours(
    body: QuietHoursUpdate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> QuietHoursView:
    """Set or clear only the authenticated recipient's daily delivery window."""
    if body.enabled:
        assert body.start is not None and body.end is not None
        window = QuietHoursWindow(body.start, body.end)
    else:
        window = None
    try:
        quiet_hours_preferences.set_own_window(
            session, account_id=account.id, window=window
        )
    except ValueError as exc:
        raise ConflictError(
            "The Account is unavailable for notification changes.",
            ErrorCode.NOTIFICATION_PREFERENCE_ACCOUNT_UNAVAILABLE,
        ) from exc
    response.headers["Cache-Control"] = "private, no-store"
    return quiet_hours_view(account)


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
    """Change only the authenticated recipient's implemented channel choice."""
    if (
        channel is NotificationChannel.EMAIL
        and not notification_policy.POLICIES[kind].push_immediately
    ):
        raise ConflictError(
            "Individual email is not allowed for this notification kind.",
            ErrorCode.NOTIFICATION_EMAIL_NOT_ALLOWED,
        )
    if (
        channel is NotificationChannel.PUSH
        and not notification_policy.POLICIES[kind].push_immediately
    ):
        raise ConflictError(
            "Immediate push is not allowed for this notification kind.",
            ErrorCode.NOTIFICATION_PUSH_NOT_ALLOWED,
        )
    if channel is NotificationChannel.EMAIL and body.enabled:
        if not email_delivery.transport_available():
            raise ConflictError(
                "Notification email transport is unavailable.",
                ErrorCode.NOTIFICATION_EMAIL_TRANSPORT_UNAVAILABLE,
            )
        if email_delivery.verified_primary_email(session, account.id) is None:
            raise ConflictError(
                "A verified primary Account email is required.",
                ErrorCode.NOTIFICATION_EMAIL_VERIFIED_PRIMARY_MISSING,
            )
    try:
        if channel is NotificationChannel.IN_APP:
            notification_preferences.set_in_app_enabled(
                session, account_id=account.id, kind=kind, enabled=body.enabled
            )
        elif channel is NotificationChannel.PUSH:
            notification_preferences.set_push_enabled(
                session, account_id=account.id, kind=kind, enabled=body.enabled
            )
        else:
            notification_preferences.set_email_enabled(
                session, account_id=account.id, kind=kind, enabled=body.enabled
            )
    except ValueError as exc:
        raise ConflictError(
            "The Account is unavailable for notification changes.",
            ErrorCode.NOTIFICATION_PREFERENCE_ACCOUNT_UNAVAILABLE,
        ) from exc
    response.headers["Cache-Control"] = "private, no-store"
    return NotificationPreferenceUpdated(kind=kind, channel=channel, enabled=body.enabled)
