"""Stable target IDs for imported records (#2141)."""

from __future__ import annotations

from uuid import RFC_4122, UUID

from eimir.core.ids import new_id
from eimir.transfer.service import _target_id


def test_the_same_source_lands_on_the_same_id_in_the_same_space() -> None:
    space, source = new_id(), new_id()
    assert _target_id(space, source) == _target_id(space, source)
    assert _target_id(space, source) != source


def test_another_space_or_source_gets_another_id() -> None:
    space, source = new_id(), new_id()
    assert _target_id(new_id(), source) != _target_id(space, source)
    assert _target_id(space, new_id()) != _target_id(space, source)


def test_the_id_is_a_uuid7_with_the_source_time_prefix() -> None:
    source = new_id()
    target = _target_id(new_id(), source)
    assert target.version == 7
    assert target.variant == RFC_4122
    assert target.bytes[:6] == source.bytes[:6]


def test_a_non_uuid7_source_still_gets_a_uuid7() -> None:
    target = _target_id(new_id(), UUID("12345678-1234-4234-8234-123456789abc"))
    assert target.version == 7
