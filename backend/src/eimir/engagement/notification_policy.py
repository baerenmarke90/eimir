"""Versioned delivery policy for the controlled NotificationKind catalog.

Classification is independent of recipient channel preferences (#638), domain
authorization and the eventual foreground presentation decision (#1211).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from uuid import UUID

from eimir.engagement.models import NotificationKind

POLICY_VERSION = 2
GENERIC_PRESENTATION_KEY = "notification.generic"


class DeliveryClass(StrEnum):
    IMMEDIATE = "IMMEDIATE"
    DIGESTIBLE = "DIGESTIBLE"
    IN_APP_ONLY = "IN_APP_ONLY"


@dataclass(frozen=True)
class PushPreviewPolicy:
    allow_sender_name: bool
    allow_event_category: bool
    allow_title: bool
    generic_only: bool
    neutral_lockscreen: bool
    presentation_key: str


# The current provider contract has one privacy-safe external presentation.
# Richer previews require an explicit adapter and domain privacy review; a
# catalog edit alone must never enable them.
GENERIC_PREVIEW = PushPreviewPolicy(
    allow_sender_name=False,
    allow_event_category=False,
    allow_title=False,
    generic_only=True,
    neutral_lockscreen=True,
    presentation_key=GENERIC_PRESENTATION_KEY,
)


@dataclass(frozen=True)
class PushPresentation:
    reference: dict[str, str]
    key: str


@dataclass(frozen=True)
class NotificationPolicy:
    delivery_class: DeliveryClass
    preview: PushPreviewPolicy

    @property
    def push_immediately(self) -> bool:
        return self.delivery_class is DeliveryClass.IMMEDIATE


# Explicit, closed catalog: a new kind cannot silently inherit a push channel.
# DIGESTIBLE events remain in the Notification Center until an approved digest
# exists; there is no one-off push fallback.
POLICIES: Mapping[NotificationKind, NotificationPolicy] = MappingProxyType(
    {
        NotificationKind.COMMENT_CREATED: NotificationPolicy(
            DeliveryClass.DIGESTIBLE, GENERIC_PREVIEW
        ),
        NotificationKind.THINKING_OF_YOU: NotificationPolicy(
            DeliveryClass.IMMEDIATE, GENERIC_PREVIEW
        ),
        NotificationKind.PARTNER_KISS: NotificationPolicy(
            DeliveryClass.IMMEDIATE, GENERIC_PREVIEW
        ),
        NotificationKind.PARTNER_CHECK_IN: NotificationPolicy(
            DeliveryClass.IMMEDIATE, GENERIC_PREVIEW
        ),
        NotificationKind.REMINDER_DUE: NotificationPolicy(
            DeliveryClass.IMMEDIATE, GENERIC_PREVIEW
        ),
    }
)


def for_kind(kind: str) -> NotificationPolicy | None:
    """Fail closed for unknown kinds rather than guessing a delivery class."""
    try:
        return POLICIES.get(NotificationKind(kind))
    except ValueError:
        return None


def presentation_for(kind: str, notification_id: UUID) -> PushPresentation | None:
    """Allow only the reviewed generic preview at the provider boundary."""
    policy = for_kind(kind)
    if policy is None or not policy.push_immediately or policy.preview != GENERIC_PREVIEW:
        return None
    return PushPresentation(
        reference={"id": str(notification_id), "kind": NotificationKind(kind).value},
        key=GENERIC_PRESENTATION_KEY,
    )
