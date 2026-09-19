"""Request identity parsing and fingerprinting (decision 0012)."""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest

from eimir.api.idempotency import parse_idempotency_key
from eimir.core.errors import ErrorCode, ValidationError
from eimir.memories.create_receipts import fingerprint

KEY = str(UUID(int=0x0198A1B2C3D47E5F8A9B0C1D2E3F4A5B))


def test_a_canonical_uuid_is_accepted_in_either_case() -> None:
    assert parse_idempotency_key(KEY) == UUID(KEY)
    assert parse_idempotency_key(f"  {KEY.upper()} ") == UUID(KEY)


@pytest.mark.parametrize(
    "value",
    [
        "",
        "not-a-uuid",
        KEY.replace("-", ""),
        f"{{{KEY}}}",
        f"urn:uuid:{KEY}",
        f'"{KEY}"',
        KEY + "0",
    ],
)
def test_anything_but_a_hyphenated_uuid_is_rejected(value: str) -> None:
    with pytest.raises(ValidationError) as caught:
        parse_idempotency_key(value)
    assert caught.value.code == ErrorCode.IDEMPOTENCY_KEY_MALFORMED


def test_the_fingerprint_is_stable_and_content_free() -> None:
    first = fingerprint(title="Titel", body="Geheimer Text", happened_on=date(2025, 6, 13))
    assert first == fingerprint(title="Titel", body="Geheimer Text", happened_on=date(2025, 6, 13))
    assert len(first) == 64
    assert "Geheimer" not in first and "Titel" not in first


@pytest.mark.parametrize(
    "changed",
    [
        {"title": "Anderer Titel"},
        {"body": "Anderer Text"},
        {"happened_on": date(2025, 6, 14)},
        {"happened_on": None},
    ],
)
def test_every_request_field_changes_the_fingerprint(changed: dict[str, object]) -> None:
    base = {"title": "Titel", "body": "Text", "happened_on": date(2025, 6, 13)}
    assert fingerprint(**base) != fingerprint(**{**base, **changed})  # type: ignore[arg-type]
