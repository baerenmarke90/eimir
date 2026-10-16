"""Identifier tests."""

from __future__ import annotations

from uuid import UUID

from eimir.core.ids import new_id, parse_id


class TestNewId:
    def test_returns_uuid_version_7(self) -> None:
        assert new_id().version == 7

    def test_is_unique(self) -> None:
        assert len({new_id() for _ in range(1000)}) == 1000

    def test_is_time_sortable(self) -> None:
        """Sortability is the reason for using v7 instead of v4.

        Without it, the primary-key index would split at a random position on
        every insert.
        """
        ids = [new_id() for _ in range(100)]
        assert ids == sorted(ids)


class TestParseId:
    def test_parses_valid_uuid(self) -> None:
        original = new_id()
        assert parse_id(str(original)) == original

    def test_returns_none_instead_of_raising(self) -> None:
        """A malformed ID from a request is an expected case.

        It must produce a clean response rather than a 500.
        """
        for invalid_value in ["", "nope", "12345", "../../etc/passwd", "' OR 1=1 --"]:
            assert parse_id(invalid_value) is None

    def test_tolerates_wrong_types(self) -> None:
        assert parse_id(None) is None  # type: ignore[arg-type]
        assert parse_id(42) is None  # type: ignore[arg-type]

    def test_accepts_form_without_hyphens(self) -> None:
        original = new_id()
        assert parse_id(original.hex) == original
        assert isinstance(parse_id(original.hex), UUID)
