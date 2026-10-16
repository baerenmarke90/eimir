"""Unit invariants for the M2 Memory model."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import CheckConstraint

from eimir.api.v1.memories import MemoryCreate, MemoryUpdate
from eimir.domain.payload import ProtectedPayload
from eimir.memories.models import Memory, MemoryPayload


def test_memory_content_lives_only_in_protected_payload() -> None:
    assert issubclass(MemoryPayload, ProtectedPayload)
    assert {"title", "body"} <= set(MemoryPayload.model_fields)
    assert "title" not in Memory.__table__.c
    assert "body" not in Memory.__table__.c
    assert "payload" in Memory.__table__.c


def test_memory_is_database_constrained_to_shared_privacy() -> None:
    checks = {
        str(constraint.sqltext)
        for constraint in Memory.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "privacy_class = 'SPACE_SHARED'" in checks
    assert "crypto_version >= 0" in checks


def test_memory_uses_sqlalchemy_optimistic_versioning() -> None:
    assert Memory.__mapper__.version_id_col is Memory.__table__.c.version
    assert Memory.__mapper__.version_id_generator is not False


def test_memory_write_contract_rejects_server_owned_fields() -> None:
    with pytest.raises(ValidationError):
        MemoryCreate.model_validate(
            {
                "title": "Titel",
                "body": "Text",
                "authorId": "01900000-0000-7000-8000-000000000000",
            }
        )

    with pytest.raises(ValidationError):
        MemoryUpdate.model_validate({"spaceId": "01900000-0000-7000-8000-000000000000"})


def test_memory_patch_distinguishes_omitted_from_explicit_null_date() -> None:
    patch = MemoryUpdate.model_validate({"happenedOn": None})
    assert patch.happened_on is None
    assert patch.model_fields_set == {"happened_on"}


def test_empty_memory_patch_is_rejected() -> None:
    with pytest.raises(ValidationError):
        MemoryUpdate.model_validate({})
