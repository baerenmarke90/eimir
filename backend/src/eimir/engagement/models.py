"""Minimized M4-B Activity, Notification, signal, and push metadata."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class ActivityKind(StrEnum):
    MEMORY_CREATED = "MEMORY_CREATED"
    MILESTONE_CREATED = "MILESTONE_CREATED"
    HEART_MOMENT_CREATED = "HEART_MOMENT_CREATED"
    WISH_CREATED = "WISH_CREATED"
    PLAN_CREATED = "PLAN_CREATED"
    PLAN_COMPLETED = "PLAN_COMPLETED"
    PLACE_CREATED = "PLACE_CREATED"
    CHAPTER_CREATED = "CHAPTER_CREATED"
    COLLECTION_CREATED = "COLLECTION_CREATED"
    COMMENT_CREATED = "COMMENT_CREATED"


class NotificationKind(StrEnum):
    COMMENT_CREATED = "COMMENT_CREATED"
    THINKING_OF_YOU = "THINKING_OF_YOU"
    PARTNER_KISS = "PARTNER_KISS"
    PARTNER_CHECK_IN = "PARTNER_CHECK_IN"
    REMINDER_DUE = "REMINDER_DUE"


class NotificationChannel(StrEnum):
    IN_APP = "IN_APP"
    PUSH = "PUSH"
    EMAIL = "EMAIL"


class SupportGestureKind(StrEnum):
    KISS = "KISS"
    CHECK_IN = "CHECK_IN"


class EngagementTarget(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"
    WISH = "WISH"
    PLAN = "PLAN"
    PLACE = "PLACE"
    CHAPTER = "CHAPTER"
    COLLECTION = "COLLECTION"


class PushDeliveryStatus(StrEnum):
    PENDING = "PENDING"
    RETRYING = "RETRYING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    UNAVAILABLE = "UNAVAILABLE"


class EmailDeliveryStatus(StrEnum):
    PENDING = "PENDING"
    CLAIMED = "CLAIMED"
    SENT = "SENT"
    UNAVAILABLE = "UNAVAILABLE"
    FAILED = "FAILED"


_ACTIVITY_KIND_VALUES = ", ".join(f"'{value.value}'" for value in ActivityKind)
_NOTIFICATION_KIND_VALUES = ", ".join(f"'{value.value}'" for value in NotificationKind)
_NOTIFICATION_CHANNEL_VALUES = ", ".join(f"'{value.value}'" for value in NotificationChannel)
_SUPPORT_GESTURE_KIND_VALUES = ", ".join(f"'{value.value}'" for value in SupportGestureKind)
_TARGET_VALUES = ", ".join(f"'{value.value}'" for value in EngagementTarget)
_PUSH_STATUS_VALUES = ", ".join(f"'{value.value}'" for value in PushDeliveryStatus)
_EMAIL_STATUS_VALUES = ", ".join(f"'{value.value}'" for value in EmailDeliveryStatus)


class Activity(IdMixin, Base):
    """A shared-space event containing references only, never protected text."""

    __tablename__ = "activities"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_event_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
    )
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(f"kind IN ({_ACTIVITY_KIND_VALUES})", name="activity_kind_allowed"),
        CheckConstraint(
            f"target_type IS NULL OR target_type IN ({_TARGET_VALUES})",
            name="activity_target_type_allowed",
        ),
        CheckConstraint(
            "(target_type IS NULL) = (target_id IS NULL)",
            name="activity_target_reference_complete",
        ),
        UniqueConstraint("source_event_id", "kind", name="uq_activities_source_event_kind"),
        Index("ix_activities_space_occurred_id", "space_id", "occurred_at", "id"),
        Index(
            "uq_activities_heart_moment_created_target",
            "space_id",
            "target_id",
            unique=True,
            postgresql_where=text("kind = 'HEART_MOMENT_CREATED' AND target_type = 'HEART_MOMENT'"),
        ),
    )


class Notification(IdMixin, Base):
    """Recipient-scoped delivery source with no copied relationship plaintext."""

    __tablename__ = "notifications"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_event_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
    )
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    in_app_visible: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        CheckConstraint(
            f"kind IN ({_NOTIFICATION_KIND_VALUES})",
            name="notification_kind_allowed",
        ),
        CheckConstraint(
            f"target_type IS NULL OR target_type IN ({_TARGET_VALUES})",
            name="notification_target_type_allowed",
        ),
        CheckConstraint(
            "(target_type IS NULL) = (target_id IS NULL)",
            name="notification_target_reference_complete",
        ),
        UniqueConstraint(
            "recipient_account_id",
            "source_event_id",
            "kind",
            name="uq_notifications_recipient_source_kind",
        ),
        Index(
            "ix_notifications_recipient_space_created_id",
            "recipient_account_id",
            "space_id",
            "created_at",
            "id",
        ),
        Index(
            "ix_notifications_recipient_space_unread",
            "recipient_account_id",
            "space_id",
            "created_at",
            postgresql_where=read_at.is_(None),
        ),
    )


class NotificationPreference(IdMixin, TimestampMixin, Base):
    """Account-owned channel override; absent rows use the versioned catalog default."""

    __tablename__ = "notification_preferences"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)

    __table_args__ = (
        CheckConstraint(f"kind IN ({_NOTIFICATION_KIND_VALUES})", name="notif_pref_kind_allowed"),
        CheckConstraint(
            f"channel IN ({_NOTIFICATION_CHANNEL_VALUES})",
            name="notif_pref_channel_allowed",
        ),
        UniqueConstraint(
            "account_id", "kind", "channel", name="uq_notification_preferences_account_kind_channel"
        ),
    )


class ThinkingOfYouRequest(IdMixin, Base):
    """Technical idempotency/cooldown receipt for a content-free partner nudge."""

    __tablename__ = "thinking_of_you_requests"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    source_event_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "sender_account_id <> recipient_account_id",
            name="thinking_sender_ne_recipient",
        ),
        UniqueConstraint(
            "source_event_id",
            name="uq_thinking_of_you_requests_source_event_id",
        ),
        UniqueConstraint(
            "space_id",
            "sender_account_id",
            "client_request_id",
            name="uq_thinking_requests_sender_space_client",
        ),
        Index(
            "ix_thinking_requests_sender_space_created",
            "sender_account_id",
            "space_id",
            "created_at",
        ),
    )


class SupportGestureRequest(IdMixin, Base):
    """Idempotency/cooldown receipt for one content-free extended partner gesture."""

    __tablename__ = "support_gesture_requests"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    client_request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    source_event_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "sender_account_id <> recipient_account_id",
            name="support_gesture_sender_ne_recipient",
        ),
        CheckConstraint(
            f"kind IN ({_SUPPORT_GESTURE_KIND_VALUES})",
            name="support_gesture_kind_allowed",
        ),
        UniqueConstraint(
            "source_event_id",
            name="uq_support_gesture_requests_source_event_id",
        ),
        UniqueConstraint(
            "space_id",
            "sender_account_id",
            "kind",
            "client_request_id",
            name="uq_support_gesture_requests_sender_space_kind_client",
        ),
        Index(
            "ix_support_gesture_requests_sender_space_kind_created",
            "sender_account_id",
            "space_id",
            "kind",
            "created_at",
        ),
    )


class PushEndpoint(IdMixin, Base):
    """Security-sensitive technical endpoint owned by one Account."""

    __tablename__ = "push_endpoints"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider_key: Mapped[str] = mapped_column(String(64), nullable=False)
    endpoint_value: Mapped[str] = mapped_column(String(2048), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "provider_key",
            "fingerprint",
            name="uq_push_endpoints_account_provider_fingerprint",
        ),
        Index("ix_push_endpoints_account_active", "account_id", "disabled_at"),
    )


class PushDelivery(IdMixin, Base):
    """Provider-neutral delivery state with no relationship plaintext."""

    __tablename__ = "push_deliveries"

    notification_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
    )

    push_endpoint_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("push_endpoints.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider_key: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=PushDeliveryStatus.PENDING.value
    )
    attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    last_error_code: Mapped[str | None] = mapped_column(String(64))
    provider_message_id: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            f"status IN ({_PUSH_STATUS_VALUES})",
            name="push_delivery_status_allowed",
        ),
        CheckConstraint("attempts >= 0", name="push_delivery_attempts_non_negative"),
        UniqueConstraint(
            "notification_id",
            "push_endpoint_id",
            name="uq_push_deliveries_notification_endpoint",
        ),
        Index("ix_push_deliveries_status_created", "status", "created_at"),
    )


class EmailDelivery(IdMixin, Base):
    """One content-free mail attempt per Notification, with no stored address."""

    __tablename__ = "email_deliveries"

    notification_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=EmailDeliveryStatus.PENDING.value
    )
    last_error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            f"status IN ({_EMAIL_STATUS_VALUES})", name="email_delivery_status_allowed"
        ),
        UniqueConstraint("notification_id", name="uq_email_deliveries_notification"),
        Index("ix_email_deliveries_status_created", "status", "created_at"),
    )
