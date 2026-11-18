"""Catalog contract of the garden seed notice (#1907 H3, concept A)."""

from uuid import uuid4

from eimir.engagement import notification_policy, notification_preferences, quiet_hours_preferences
from eimir.engagement.models import COALESCED_NOTIFICATION_KINDS, NotificationKind
from eimir.engagement.notification_policy import GENERIC_PREVIEW, DeliveryClass


def test_seed_notice_is_immediate_generic_push_without_email() -> None:
    kind = NotificationKind.GARDEN_SEED_ARRIVED
    policy = notification_policy.for_kind(kind.value)
    assert policy is not None
    assert policy.delivery_class is DeliveryClass.IMMEDIATE
    assert policy.preview == GENERIC_PREVIEW
    assert notification_policy.push_choice_allowed(kind.value)
    assert not notification_policy.email_choice_allowed(kind.value)
    reference = notification_policy.presentation_for(kind.value, uuid4())
    assert reference is not None
    assert reference.key == notification_policy.GENERIC_PRESENTATION_KEY


def test_seed_notice_has_its_own_switch_and_waits_for_quiet_hours() -> None:
    kind = NotificationKind.GARDEN_SEED_ARRIVED
    # The Product Owner asked for a notice the recipient can switch off on its own.
    assert kind not in notification_preferences.INHERITED_KINDS
    assert kind in quiet_hours_preferences.DEFERABLE_KINDS
    # One current notice per recipient and seed (at most one seed per partner and day).
    assert kind.value in COALESCED_NOTIFICATION_KINDS
