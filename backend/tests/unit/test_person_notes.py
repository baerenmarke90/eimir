"""Notes stay in the protected parent payload and tolerate pre-note records."""

import pytest
from pydantic import ValidationError

from eimir.api.v1.people import RelatedPersonFields
from eimir.people.models import RelatedPersonPayload


def test_legacy_payload_gets_an_empty_note_and_new_notes_round_trip() -> None:
    assert RelatedPersonPayload.unseal({"display_name": "Emma"}).note == ""
    payload = RelatedPersonPayload(display_name="Emma", note="Sea walks.\nStrawberry cake.")
    assert RelatedPersonPayload.unseal(payload.seal()) == payload
    with pytest.raises(ValidationError):
        RelatedPersonPayload(display_name="Emma", note="n" * 2001)


def test_update_input_distinguishes_an_omitted_note_from_explicit_clearing() -> None:
    fields = {"displayName": "Emma", "relationship": "DAUGHTER"}
    assert RelatedPersonFields.model_validate(fields).note is None
    assert RelatedPersonFields.model_validate({**fields, "note": None}).note is None
    assert RelatedPersonFields.model_validate({**fields, "note": ""}).note == ""
