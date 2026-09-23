"""Versioned delivery policy for the controlled NotificationKind catalog.

Classification is independent of recipient channel preferences (#638), domain
authorization and the eventual foreground presentation decision (#1211).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Mapping

from eimir.engagement.models import NotificationKind

POLICY_VERSION = 1
GENERIC_PRESENTATION_KEY = "notification.generic"


class DeliveryClass(StrEnum):
    IMMEDIATE = "IMMEDIATE"
    DIGESTIBLE = "DIGESTIBLE"
    IN_APP_ONLY = "IN_APP_ONLY"


@dataclass(frozen=True)
class NotificationPolicy:
    delivery_class: DeliveryClass
    push_presentation_key: str = GENERIC_PRESENTATION_KEY

    @property
    def push_immediately(self) -> bool:
        return self.delivery_class is DeliveryClass.IMMEDIATE


# Explicit, closed catalog: a new kind cannot silently inherit a push channel.
# DIGESTIBLE events remain in the Notification Center until an approved digest
# exists; there is no one-off push fallback.
POLICIES: Mapping[NotificationKind, NotificationPolicy] = MappingProxyType(
    {
        NotificationKind.COMMENT_CREATED: NotificationPolicy(DeliveryClass.DIGESTIBLE),
        NotificationKind.THINKING_OF_YOU: NotificationPolicy(DeliveryClass.IMMEDIATE),
        NotificationKind.PARTNER_KISS: NotificationPolicy(DeliveryClass.IMMEDIATE),
        NotificationKind.PARTNER_CHECK_IN: NotificationPolicy(DeliveryClass.IMMEDIATE),
        NotificationKind.REMINDER_DUE: NotificationPolicy(DeliveryClass.IMMEDIATE),
    }
)


def for_kind(kind: str) -> NotificationPolicy | None:
    """Fail closed for unknown kinds rather than guessing a delivery class."""
    try:
        return POLICIES.get(NotificationKind(kind))
    except ValueError:
        return None
