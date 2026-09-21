"""Transfer bundles cross the encryption boundary explicitly (issue #797).

Export is user-authorized and therefore plaintext by definition; it must never
copy stored ciphertext into the archive, and import must never persist archive
plaintext.
"""

from __future__ import annotations

import io
import json
from zipfile import ZipFile

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.memories.models import Memory, MemoryPayload
from eimir.relationship import service as relationship_service
from eimir.transfer import jobs, service
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "Transported memory"


def test_export_is_plaintext_and_import_is_encrypted_again(session: Session, encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    source = make_space(session, anna)
    relationship_service.add_member(session, source.id, ben)
    target = make_space(session, anna)
    relationship_service.add_member(session, target.id, ben)
    session.add(
        Memory(
            space_id=source.id,
            owner_id=anna.id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            payload=MemoryPayload(title=TITLE, body="Body text"),
        )
    )
    session.flush()
    stored = session.execute(
        text("SELECT payload::text FROM memories WHERE space_id = :s"), {"s": source.id}
    ).scalar_one()
    assert TITLE not in stored

    source_context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    target_context = AuthorizationContext(account_id=anna.id, space_id=target.id)
    with service.build_export_archive(session, source_context, TransferScope.SHARED) as bundle:
        with ZipFile(bundle) as archive:
            document = json.loads(archive.read("memories.json"))
        rows = next(t for t in document["tables"] if t["name"] == "memories")["rows"]
        assert rows[0]["payload"]["title"] == TITLE
        assert rows[0]["cryptoVersion"] == 0

        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        transfer = service.create_import(session, target_context, bundle, size=size)
    session.flush()

    # The staged artifact, as the storage provider holds it, is ciphertext.
    from eimir.config import get_settings
    from eimir.media import build_plain_media_store

    with build_plain_media_store(get_settings()).open(service.import_storage_key(transfer)) as raw:
        assert raw.read(8) == b"EIMIRENC"

    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    service.request_apply(session, target_context, str(transfer.id))
    session.flush()
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED.value

    raw_payload, version = session.execute(
        text("SELECT payload::text, crypto_version FROM memories WHERE space_id = :s"),
        {"s": target.id},
    ).one()
    assert TITLE not in raw_payload
    assert version == 2
    imported = session.query(Memory).filter(Memory.space_id == target.id).one()
    assert imported.payload.title == TITLE
