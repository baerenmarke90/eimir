"""Catalog contract of the shared-note push notices (#1969)."""

from uuid import uuid4

import pytest

from eimir.engagement import (
    notification_policy,
    notification_preferences,
    push_preview,
    quiet_hours_preferences,
)
from eimir.engagement.models import COALESCED_NOTIFICATION_KINDS, NotificationKind
from eimir.engagement.notification_policy import GENERIC_PREVIEW, DeliveryClass

KINDS = (NotificationKind.SHARED_NOTE_CREATED, NotificationKind.SHARED_NOTE_CHANGED)


@pytest.mark.parametrize("kind", KINDS)
def test_a_shared_note_notice_is_an_immediate_generic_push_without_email(
    kind: NotificationKind,
) -> None:
    policy = notification_policy.for_kind(kind.value)
    assert policy is not None
    assert policy.delivery_class is DeliveryClass.IMMEDIATE
    assert policy.preview == GENERIC_PREVIEW
    assert notification_policy.push_choice_allowed(kind.value)
    assert not notification_policy.email_choice_allowed(kind.value)
    reference = notification_policy.presentation_for(kind.value, uuid4())
    assert reference is not None
    assert reference.key == notification_policy.GENERIC_PRESENTATION_KEY
    assert set(reference.reference) == {"id", "kind"}


@pytest.mark.parametrize("kind", KINDS)
def test_a_shared_note_notice_follows_the_comment_choice_and_quiet_hours(
    kind: NotificationKind,
) -> None:
    assert notification_preferences.INHERITED_KINDS[kind] is NotificationKind.COMMENT_CREATED
    assert kind in quiet_hours_preferences.DEFERABLE_KINDS
    assert kind.value in push_preview.SHARED_NOTE_KINDS


def test_edits_of_one_note_leave_one_current_notice() -> None:
    assert NotificationKind.SHARED_NOTE_CHANGED.value in COALESCED_NOTIFICATION_KINDS
