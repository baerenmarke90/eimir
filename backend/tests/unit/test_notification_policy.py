"""Contract checks for the versioned, closed notification delivery catalog."""

from eimir.engagement.models import NotificationKind
from eimir.engagement.notification_policy import POLICIES, DeliveryClass, for_kind


def test_each_persisted_kind_has_an_explicit_delivery_class() -> None:
    assert set(POLICIES) == set(NotificationKind)
    assert for_kind("UNRECOGNIZED_EVENT") is None


def test_comment_remains_center_only_until_digest_delivery_exists() -> None:
    policy = for_kind(NotificationKind.COMMENT_CREATED.value)
    assert policy is not None
    assert policy.delivery_class is DeliveryClass.DIGESTIBLE
    assert not policy.push_immediately


def test_existing_explicit_signals_and_due_reminders_keep_generic_push() -> None:
    for kind in (
        NotificationKind.THINKING_OF_YOU,
        NotificationKind.PARTNER_KISS,
        NotificationKind.PARTNER_CHECK_IN,
        NotificationKind.REMINDER_DUE,
    ):
        policy = for_kind(kind.value)
        assert policy is not None
        assert policy.push_immediately
        assert policy.push_presentation_key == "notification.generic"
