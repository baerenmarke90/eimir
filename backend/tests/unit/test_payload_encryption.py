"""ProtectedPayloadJSON under encryption, and the guards around it (issue #797)."""

from __future__ import annotations

import logging

import pytest
from sqlalchemy.dialects import postgresql

from eimir.db.protected_payload import ProtectedPayloadError, ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload
from eimir.security import lifecycle
from eimir.security.errors import DecryptionError, PlaintextRejectedError


class NotePayload(ProtectedPayload):
    title: str
    body: str = ""


DIALECT = postgresql.dialect()

# Renaming a payload class changes its authenticated context and would make
# every stored row of that type unreadable. A rename must pin the old label by
# overriding ``crypto_context``; then update this table in the same change.
PINNED_CONTEXTS = {
    "attachments": "AttachmentPayload",
    "chapters": "ChapterPayload",
    "collection_items": "CollectionItemPayload",
    "collections": "CollectionPayload",
    "comments": "CommentPayload",
    "gift_ideas": "GiftIdeaPayload",
    "heart_moments": "HeartMomentPayload",
    "important_dates": "ImportantDatePayload",
    "memories": "MemoryPayload",
    "milestones": "MilestonePayload",
    "places": "PlacePayload",
    "plans": "PlanPayload",
    "private_collection_items": "PrivateCollectionItemPayload",
    "private_collections": "PrivateCollectionPayload",
    "private_notes": "PrivateNotePayload",
    "profile_preferences": "ProfilePreferencePayload",
    "related_persons": "RelatedPersonPayload",
    "reminders": "ReminderPayload",
    "wishes": "WishPayload",
}


def test_every_protected_table_is_discovered_and_its_context_is_pinned() -> None:
    discovered = {entry.name: entry.context for entry in lifecycle.payload_tables()}
    assert discovered == PINNED_CONTEXTS


def test_every_protected_payload_column_has_a_crypto_version_column() -> None:
    """The migration and status tooling rely on the sibling metadata column."""
    from eimir.db.base import Base
    from eimir.db.registry import load_all_models

    load_all_models()
    for table in Base.metadata.tables.values():
        column = table.columns.get("payload")
        if column is not None and isinstance(column.type, ProtectedPayloadJSON):
            assert "crypto_version" in table.columns, table.name


def test_encrypted_bind_and_result_round_trip(encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    column = ProtectedPayloadJSON(NotePayload)
    stored = column.process_bind_param(NotePayload(title="secret", body="also"), DIALECT)
    assert "secret" not in str(stored)
    assert column.process_result_value(stored, DIALECT) == NotePayload(title="secret", body="also")


def test_column_refuses_plaintext_when_encryption_is_required(encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    with pytest.raises(PlaintextRejectedError):
        ProtectedPayloadJSON(NotePayload).process_result_value({"title": "x"}, DIALECT)


def test_column_refuses_ciphertext_when_encryption_is_disabled(encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    column = ProtectedPayloadJSON(NotePayload)
    stored = column.process_bind_param(NotePayload(title="x"), DIALECT)
    encryption.apply("disabled")
    with pytest.raises(DecryptionError):
        column.process_result_value(stored, DIALECT)


def test_ciphertext_is_bound_to_the_payload_type(encryption) -> None:  # type: ignore[no-untyped-def]
    class OtherPayload(ProtectedPayload):
        title: str

    encryption.apply("required")
    stored = ProtectedPayloadJSON(NotePayload).process_bind_param(NotePayload(title="x"), DIALECT)
    with pytest.raises(DecryptionError):
        ProtectedPayloadJSON(OtherPayload).process_result_value(stored, DIALECT)


def test_schema_drift_error_does_not_quote_decrypted_content(  # type: ignore[no-untyped-def]
    encryption, caplog: pytest.LogCaptureFixture
) -> None:
    encryption.apply("required")
    stored = ProtectedPayloadJSON(NotePayload).process_bind_param(
        NotePayload(title="secret-canary-title"), DIALECT
    )

    class Stricter(ProtectedPayload):
        title: int  # stored value no longer satisfies the type

        @classmethod
        def crypto_context(cls) -> str:
            return NotePayload.crypto_context()

    with caplog.at_level(logging.DEBUG), pytest.raises(ProtectedPayloadError) as raised:
        ProtectedPayloadJSON(Stricter).process_result_value(stored, DIALECT)
    assert "secret-canary-title" not in str(raised.value)
    assert "secret-canary-title" not in caplog.text
    assert raised.value.__cause__ is None
    assert raised.value.__suppress_context__


def test_key_lifecycle_module_never_logs_or_prints_content() -> None:
    """The lifecycle module has no logging or print call that could carry payload data."""
    import inspect

    source = inspect.getsource(lifecycle)
    assert "print(" not in source
    assert "logging" not in source
