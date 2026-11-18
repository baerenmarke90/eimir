"""Pure decisions behind recap readiness notices and late-entry tracking (#1744)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from eimir.core import clock
from eimir.domain.events import EventType
from eimir.engagement import notification_policy, notification_preferences, quiet_hours_preferences
from eimir.engagement.models import COALESCED_NOTIFICATION_KINDS, NotificationKind
from eimir.engagement.notification_policy import GENERIC_PREVIEW, DeliveryClass
from eimir.recaps import freshness, notices
from eimir.recaps.freshness import Step

NOW = datetime(2026, 11, 7, 10, tzinfo=UTC)


def test_a_change_waits_for_a_quiet_period_and_a_new_change_restarts_it() -> None:
    assert freshness.observe("a", None, None, "a", NOW, retained=False).step is Step.FRESH
    first = freshness.observe("a", None, None, "b", NOW, retained=False)
    assert (first.step, first.observed_digest, first.observed_at) == (Step.WAIT, "b", NOW)
    later = NOW + freshness.QUIET - timedelta(minutes=1)
    assert freshness.observe("a", "b", NOW, "b", later, retained=False).step is Step.WAIT
    # Another back-filled entry before the quiet period ends restarts it.
    burst = freshness.observe("a", "b", NOW, "c", later, retained=False)
    assert (burst.step, burst.observed_digest, burst.observed_at) == (Step.WAIT, "c", later)
    quiet = freshness.observe("a", "c", later, "c", later + freshness.QUIET, retained=True)
    assert quiet.step is Step.ACT
    # A change that is undone before acting needs nothing.
    assert freshness.observe("a", "c", later, "a", later, retained=True).step is Step.FRESH


def test_unknown_composition_state_recomposes_a_proposal_but_only_adopts_a_retained_one() -> None:
    assert freshness.observe(None, None, None, "x", NOW, retained=False).step is Step.ACT
    assert freshness.observe(None, None, None, "x", NOW, retained=True).step is Step.BASELINE


def test_a_version_is_worth_it_when_a_late_moment_leads_or_several_join() -> None:
    previous = ["MEMORY:a", "MEMORY:b"]
    selected = ["MEMORY:a", "MEMORY:c", "MEMORY:d", "MEMORY:e"]
    # An entry that was there before but newly selected is not late.
    late = freshness.late_moments(previous, selected, {"MEMORY:c", "MEMORY:d"})
    assert late == ["MEMORY:c", "MEMORY:d"]
    assert not freshness.significant(late, "MEMORY:a")
    assert freshness.significant(late, "MEMORY:c")
    assert freshness.significant(["MEMORY:c", "MEMORY:d", "MEMORY:e"], "MEMORY:a")
    assert not freshness.significant([], None)


def test_digests_are_stable_and_empty_material_has_its_own_value() -> None:
    assert freshness.digest([]) == freshness.EMPTY
    assert freshness.digest(["1:x", "2:y"]) == freshness.digest(["1:x", "2:y"])
    assert freshness.digest(["1:x", "2:y"]) != freshness.digest(["1:x", "2:z"])


def test_only_a_completed_period_is_announced_and_december_waits_for_the_year() -> None:
    today = date(2026, 11, 8)
    assert notices.announcement("MONTH", 10, date(2026, 10, 31), today) == notices.READY
    assert notices.announcement("MONTH", 11, date(2026, 11, 30), today) is None
    assert notices.announcement("YEAR", 0, date(2026, 12, 31), today) is None
    january = date(2027, 1, 8)
    assert notices.announcement("MONTH", 12, date(2026, 12, 31), january) is None
    assert notices.announcement("YEAR", 0, date(2026, 12, 31), january) == notices.READY
    # Periods that only appear long after they ended are earlier news.
    assert notices.announcement("MONTH", 3, date(2025, 3, 31), today) == notices.EARLIER
    assert notices.announcement("MONTH", 3, date(2025, 3, 31), today, grew=True) == notices.GREW
    assert notices.announcement("MONTH", 12, date(2025, 12, 31), today, grew=True) == notices.GREW


def test_notices_wait_for_the_daytime_window_of_the_space() -> None:
    berlin = clock.resolve_zone("Europe/Berlin")
    # 06:30 Berlin -> 09:00 Berlin the same day.
    early = datetime(2026, 11, 7, 5, 30, tzinfo=UTC)
    assert notices.release_at(early, berlin) == datetime(2026, 11, 7, 8, tzinfo=UTC)
    assert notices.release_at(NOW, berlin) == NOW
    # 22:00 Berlin -> 09:00 Berlin the next day.
    late = datetime(2026, 11, 7, 21, tzinfo=UTC)
    assert notices.release_at(late, berlin) == datetime(2026, 11, 8, 8, tzinfo=UTC)


def test_ready_notices_go_alone_and_late_ones_at_most_once_a_day() -> None:
    ready, grew, earlier, older = (uuid4() for _ in range(4))
    single = notices.plan(
        [
            notices.Pending(ready, notices.READY, (2026, 10, 0)),
            notices.Pending(grew, notices.GREW, (2026, 3, 0)),
        ],
        None,
        NOW,
    )
    assert single.single == [(ready, EventType.RECAP_READY), (grew, EventType.RECAP_GREW)]
    collected = notices.plan(
        [
            notices.Pending(earlier, notices.EARLIER, (2025, 4, 0)),
            notices.Pending(older, notices.EARLIER, (2024, 2, 0)),
            notices.Pending(grew, notices.GREW, (2026, 3, 0)),
        ],
        None,
        NOW,
    )
    assert collected.single == [] and collected.collected == [grew, earlier, older]
    waiting = notices.plan(
        [
            notices.Pending(ready, notices.READY, (2026, 10, 0)),
            notices.Pending(earlier, notices.EARLIER, (2025, 4, 0)),
        ],
        NOW - timedelta(hours=3),
        NOW,
    )
    assert waiting.single == [(ready, EventType.RECAP_READY)]
    assert waiting.deferred == [earlier]
    assert waiting.retry_at == NOW + timedelta(hours=21)


def test_recap_notices_are_neutral_immediate_pushes_with_their_own_switch() -> None:
    for kind in (NotificationKind.RECAP_READY, NotificationKind.RECAP_GREW):
        policy = notification_policy.for_kind(kind.value)
        assert policy is not None
        assert policy.delivery_class is DeliveryClass.IMMEDIATE
        assert policy.preview == GENERIC_PREVIEW
        assert notification_policy.push_choice_allowed(kind.value)
        assert not notification_policy.email_choice_allowed(kind.value)
        assert kind in quiet_hours_preferences.DEFERABLE_KINDS
        assert kind.value not in COALESCED_NOTIFICATION_KINDS
    assert NotificationKind.RECAP_READY not in notification_preferences.INHERITED_KINDS
    assert (
        notification_preferences.INHERITED_KINDS[NotificationKind.RECAP_GREW]
        is NotificationKind.RECAP_READY
    )
