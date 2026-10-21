"""Key-less raw audit of what is persisted (issue #797).

The audit must see exactly what a database dump or a bucket snapshot exposes, and
must never need, use, or print key material or content.
"""

from __future__ import annotations

import io
import json
import random
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.media import LocalMediaStore
from eimir.media.base import build_storage_key
from eimir.media.encrypted import MAGIC, EncryptingMediaStore
from eimir.memories.models import Memory, MemoryPayload
from eimir.security import lifecycle
from eimir.security.__main__ import _audit_raw
from eimir.security.keyring import EncryptionMode
from eimir.security.runtime import get_key_ring
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "Baltic sailing trip"
PLAIN_BYTES = b"\xff\xd8\xff\xe0 plaintext jpeg bytes that must never reach a provider"


@pytest.fixture
def space(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Audit Anna")
    return make_space(session, account), account


def _memory(session: Session, space) -> Memory:  # type: ignore[no-untyped-def]
    space_row, account = space
    memory = Memory(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 5, 1),
        payload=MemoryPayload(title=TITLE, body="We danced in the rain."),
    )
    session.add(memory)
    session.flush()
    return memory


def _attachment(session: Session, space) -> Attachment:  # type: ignore[no-untyped-def]
    space_row, account = space
    row = Attachment(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=len(PLAIN_BYTES),
        mime_type="image/jpeg",
        size=len(PLAIN_BYTES),
        width=1,
        height=1,
        has_thumbnail=False,
        ready_at=now(),
        payload=AttachmentPayload(original_name="audit.jpg"),
    )
    session.add(row)
    session.flush()
    return row


def _audit_payloads(session: Session) -> lifecycle.RawAuditReport:
    report = lifecycle.RawAuditReport()
    lifecycle.audit_raw_payloads(session, report)
    return report


class TestPayloads:
    def test_encrypted_rows_pass_without_any_key(self, session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("required")
        _memory(session, space)
        # The audit is defined to work without key material.
        encryption.apply("disabled")

        report = _audit_payloads(session)

        assert report.rows["memories"] == 1
        assert not report.not_enveloped
        assert report.ok

    def test_legacy_plaintext_row_is_flagged(self, session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("disabled")
        _memory(session, space)

        report = _audit_payloads(session)

        assert report.not_enveloped["memories"] == 1
        assert not report.ok

    def test_plaintext_key_next_to_an_envelope_is_flagged(
        self, session: Session, space, encryption
    ) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("required")
        memory = _memory(session, space)
        session.execute(
            text("UPDATE memories SET payload = payload || CAST(:extra AS jsonb) WHERE id = :id"),
            {"extra": json.dumps({"title": TITLE}), "id": memory.id},
        )

        assert _audit_payloads(session).not_enveloped["memories"] == 1

    @pytest.mark.parametrize("stored", ['"just a string"', "[]", "null"])
    def test_non_object_payload_is_flagged_not_an_error(
        self, session: Session, space, encryption, stored: str
    ) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("required")
        memory = _memory(session, space)
        session.execute(
            text("UPDATE memories SET payload = CAST(:stored AS jsonb) WHERE id = :id"),
            {"stored": stored, "id": memory.id},
        )

        assert _audit_payloads(session).not_enveloped["memories"] == 1

    def test_scheme_mismatch_between_column_and_payload_is_flagged(
        self, session: Session, space, encryption
    ) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("required")
        memory = _memory(session, space)
        session.execute(
            text("UPDATE memories SET crypto_version = 0 WHERE id = :id"), {"id": memory.id}
        )

        assert _audit_payloads(session).not_enveloped["memories"] == 1

    def test_report_never_contains_content(self, session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("disabled")
        _memory(session, space)

        assert TITLE not in repr(_audit_payloads(session))


class TestMedia:
    @pytest.fixture
    def stores(self, tmp_path: Path, encryption):  # type: ignore[no-untyped-def]
        encryption.apply("required")
        plain = LocalMediaStore(tmp_path)
        return plain, EncryptingMediaStore(plain, get_key_ring(), EncryptionMode.REQUIRED)

    def _put(self, store, session: Session, attachment: Attachment) -> str:  # type: ignore[no-untyped-def]
        key = build_storage_key(attachment.space_id, attachment.id)
        store.put(key, io.BytesIO(PLAIN_BYTES), "image/jpeg")
        return key

    def test_encrypted_objects_pass(self, session: Session, space, stores) -> None:  # type: ignore[no-untyped-def]
        plain, encrypting = stores
        self._put(encrypting, session, _attachment(session, space))
        report = lifecycle.RawAuditReport()

        lifecycle.audit_raw_media(session, plain, report, sample=0)

        assert (report.objects_encrypted, report.objects_plaintext) == (1, 0)
        assert report.ok

    def test_plaintext_object_is_flagged(self, session: Session, space, stores) -> None:  # type: ignore[no-untyped-def]
        plain, _ = stores
        self._put(plain, session, _attachment(session, space))
        report = lifecycle.RawAuditReport()

        lifecycle.audit_raw_media(session, plain, report, sample=0)

        assert report.objects_plaintext == 1
        assert not report.ok

    def test_missing_object_is_counted_not_failed(self, session: Session, space, stores) -> None:  # type: ignore[no-untyped-def]
        plain, _ = stores
        _attachment(session, space)
        report = lifecycle.RawAuditReport()

        lifecycle.audit_raw_media(session, plain, report, sample=0)

        # A space-bound attachment has two candidate homes (space and account).
        assert report.objects_absent == 2
        assert report.ok

    def test_sampling_bounds_the_objects_inspected(self, session: Session, space, stores) -> None:  # type: ignore[no-untyped-def]
        plain, encrypting = stores
        for _ in range(5):
            self._put(encrypting, session, _attachment(session, space))
        report = lifecycle.RawAuditReport()

        lifecycle.audit_raw_media(session, plain, report, sample=2, rng=random.Random(1))

        # Two candidate homes per space-bound attachment.
        assert (report.objects_total, report.objects_sampled) == (10, 2)

    def test_the_object_header_is_the_only_thing_read(
        self, session: Session, space, stores
    ) -> None:  # type: ignore[no-untyped-def]
        plain, encrypting = stores
        key = self._put(encrypting, session, _attachment(session, space))
        with plain.open(key) as handle:
            assert handle.read(len(MAGIC)) == MAGIC


class TestCommand:
    def test_exit_code_and_output_carry_counts_only(
        self,
        session: Session,
        space,
        tmp_path: Path,
        encryption,
        capsys: pytest.CaptureFixture[str],
    ) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("disabled")
        _memory(session, space)
        plain = LocalMediaStore(tmp_path)

        assert _audit_raw(session, plain, 0) == 1

        output = capsys.readouterr().out
        assert "result=FAILED" in output
        assert "not_enveloped={'memories': 1}" in output
        assert TITLE not in output

    def test_clean_state_exits_zero(
        self,
        session: Session,
        space,
        tmp_path: Path,
        encryption,
        capsys: pytest.CaptureFixture[str],
    ) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("required")
        plain = LocalMediaStore(tmp_path)
        _memory(session, space)
        _attachment(session, space)  # object absent from the store: counted, not failed

        assert _audit_raw(session, plain, 0) == 0
        assert "result=ok" in capsys.readouterr().out
