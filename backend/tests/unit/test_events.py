"""Outbox events may carry only explicitly approved metadata."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.domain.payload import ProtectedPayload
from eimir.outbox.payload import PublicEventPayloadJSON


class PrivateContent(ProtectedPayload):
    title: str
    body: str


class SneakyEventPayload(PublicEventPayload):
    body: str


def _event(payload: object) -> DomainEvent:
    return DomainEvent.model_validate(
        {
            "type": EventType.MEMORY_CREATED,
            "space_id": new_id(),
            "subject_type": "memory",
            "subject_id": new_id(),
            "payload": payload,
        }
    )


def test_allowed_metadata_is_typed() -> None:
    event = _event({"has_attachment": True})
    assert event.payload == PublicEventPayload(has_attachment=True)


@pytest.mark.parametrize("field", ["title", "body", "text", "content", "location"])
def test_unknown_plaintext_fields_are_rejected(field: str) -> None:
    with pytest.raises(ValidationError):
        _event({field: "private plaintext"})


def test_protected_payload_cannot_become_outbox_payload() -> None:
    with pytest.raises(ValidationError):
        _event(PrivateContent(title="Surprise", body="Secret"))


def test_raw_dictionary_is_rejected_at_outbox_database_boundary() -> None:
    storage = PublicEventPayloadJSON()
    with pytest.raises(TypeError, match="PublicEventPayload required"):
        storage.process_bind_param(  # type: ignore[arg-type]
            {"body": "private plaintext"}, postgresql.dialect()
        )


def test_extended_payload_subclass_does_not_bypass_allowlist() -> None:
    storage = PublicEventPayloadJSON()
    with pytest.raises(TypeError, match="PublicEventPayload required"):
        storage.process_bind_param(
            SneakyEventPayload(body="private plaintext"), postgresql.dialect()
        )
