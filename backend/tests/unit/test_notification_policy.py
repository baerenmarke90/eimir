"""Contract checks for the versioned, closed notification delivery catalog."""

from dataclasses import replace
from datetime import UTC, datetime
from types import MappingProxyType
from uuid import uuid4

from eimir.engagement import notification_policy
from eimir.engagement.models import NotificationKind
from eimir.engagement.notification_policy import (
    GENERIC_PREVIEW,
    POLICIES,
    DeliveryClass,
    NotificationPolicy,
    for_kind,
    presentation_for,
)


def test_each_persisted_kind_has_an_explicit_delivery_class() -> None:
    assert set(POLICIES) == set(NotificationKind)
    assert for_kind("UNRECOGNIZED_EVENT") is None


def test_comment_has_no_immediate_push_but_allows_one_generic_opted_in_digest() -> None:
    policy = for_kind(NotificationKind.COMMENT_CREATED.value)
    assert policy is not None
    assert policy.delivery_class is DeliveryClass.DIGESTIBLE
    assert not policy.push_immediately
    assert presentation_for(NotificationKind.COMMENT_CREATED.value, uuid4()) is None
    reference = notification_policy.digest_presentation_for(
        NotificationKind.COMMENT_CREATED.value, uuid4()
    )
    assert reference is not None
    assert reference.key == "notification.generic"
    assert notification_policy.digest_presentation_for("UNRECOGNIZED_EVENT", uuid4()) is None
    assert notification_policy.push_choice_allowed(NotificationKind.COMMENT_CREATED.value)
    assert notification_policy.push_choice_allowed(NotificationKind.THINKING_OF_YOU.value)
    assert not notification_policy.push_choice_allowed("UNRECOGNIZED_EVENT")


def test_digest_window_uses_fixed_utc_projection_hour() -> None:
    assert notification_policy.digest_window(datetime(2026, 9, 24, 12, 59, tzinfo=UTC)) == (
        datetime(2026, 9, 24, 12, tzinfo=UTC),
        datetime(2026, 9, 24, 13, tzinfo=UTC),
    )


def test_existing_explicit_signals_and_due_reminders_keep_generic_push() -> None:
    notification_id = uuid4()
    for kind in (
        NotificationKind.THINKING_OF_YOU,
        NotificationKind.PARTNER_KISS,
        NotificationKind.PARTNER_CHECK_IN,
        NotificationKind.REMINDER_DUE,
    ):
        policy = for_kind(kind.value)
        assert policy is not None
        assert policy.push_immediately
        assert policy.preview == GENERIC_PREVIEW
        presentation = presentation_for(kind.value, notification_id)
        assert presentation is not None
        assert presentation.key == "notification.generic"
        assert presentation.reference == {"id": str(notification_id), "kind": kind.value}


def test_preview_contract_fails_closed_for_unreviewed_fields_and_classes(
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    notification_id = uuid4()
    for policy in POLICIES.values():
        assert not policy.preview.allow_sender_name
        assert not policy.preview.allow_event_category
        assert not policy.preview.allow_title
        assert policy.preview.generic_only
        assert policy.preview.neutral_lockscreen

    assert presentation_for(NotificationKind.COMMENT_CREATED.value, notification_id) is None
    assert presentation_for("UNRECOGNIZED_EVENT", notification_id) is None
    expanded_preview = replace(GENERIC_PREVIEW, allow_sender_name=True)
    expanded_catalog = dict(POLICIES)
    expanded_catalog[NotificationKind.THINKING_OF_YOU] = NotificationPolicy(
        DeliveryClass.IMMEDIATE, expanded_preview
    )
    monkeypatch.setattr(notification_policy, "POLICIES", MappingProxyType(expanded_catalog))
    assert presentation_for(NotificationKind.THINKING_OF_YOU.value, notification_id) is None
    expanded_catalog[NotificationKind.COMMENT_CREATED] = NotificationPolicy(
        DeliveryClass.DIGESTIBLE, expanded_preview
    )
    monkeypatch.setattr(notification_policy, "POLICIES", MappingProxyType(expanded_catalog))
    assert (
        notification_policy.digest_presentation_for(
            NotificationKind.COMMENT_CREATED.value, notification_id
        )
        is None
    )
    assert not notification_policy.push_choice_allowed(NotificationKind.COMMENT_CREATED.value)
