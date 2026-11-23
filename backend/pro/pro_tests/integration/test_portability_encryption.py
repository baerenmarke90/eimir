"""Bundles cross the encryption boundary explicitly (issue #797, kept by the tool).

An operator export is plaintext by definition: it must never copy stored ciphertext into the
file, and the import must never persist archive plaintext.
"""

from __future__ import annotations

import io
import json
from datetime import date
from pathlib import Path
from zipfile import ZipFile

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.heart_moments.location import HeartMomentLocation
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.plans import service as plans
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from eimir.wishes import service as wishes
from eimir.wishes.models import Wish
from pro_tests.support.portability import export_bytes, import_bytes
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "Transported memory"


def test_export_is_plaintext_and_import_is_encrypted_again(
    session: Session, encryption, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
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
            payload=MemoryPayload(title=TITLE, body="Body text", tags=["home"]),
        )
    )
    session.add(
        HeartMoment(
            space_id=source.id,
            owner_id=anna.id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            happened_on=date(2026, 9, 29),
            payload=HeartMomentPayload(
                text="",
                emotion=HeartEmotion.LOVED,
                tags=["everyday"],
                location=HeartMomentLocation(name="Transported lake", latitude=49.1, longitude=7.2),
            ),
        )
    )
    session.flush()
    stored = session.execute(
        text("SELECT payload::text FROM memories WHERE space_id = :s"), {"s": source.id}
    ).scalar_one()
    assert TITLE not in stored
    heart_stored = session.execute(
        text("SELECT payload::text FROM heart_moments WHERE space_id = :s"),
        {"s": source.id},
    ).scalar_one()
    assert "everyday" not in heart_stored
    assert "Transported lake" not in heart_stored

    source_context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    target_context = AuthorizationContext(account_id=anna.id, space_id=target.id)
    wishes.create_wish(session, source_context, title="A wish", tags=["Summer"])
    plans.create_plan(
        session, source_context, title="A plan", description=None, place_id=None, tags=["Concert"]
    )
    session.flush()
    for table, label in (("plans", "Concert"), ("wishes", "Summer")):
        assert label not in session.scalar(
            text(f"SELECT payload::text FROM {table} WHERE space_id=:s"), {"s": source.id}
        )

    data = export_bytes(session, source_context, tmp_path)
    with ZipFile(io.BytesIO(data)) as archive:
        document = json.loads(archive.read("memories.json"))
        heart_document = json.loads(archive.read("heart-moments.json"))
    rows = next(t for t in document["tables"] if t["name"] == "memories")["rows"]
    assert rows[0]["payload"]["title"] == TITLE
    assert rows[0]["payload"]["tags"] == ["home"]
    assert rows[0]["cryptoVersion"] == 0
    heart_rows = next(
        table for table in heart_document["tables"] if table["name"] == "heart_moments"
    )["rows"]
    assert heart_rows[0]["payload"]["text"] == ""
    assert heart_rows[0]["payload"]["tags"] == ["everyday"]
    assert heart_rows[0]["payload"]["location"]["name"] == "Transported lake"

    import_bytes(session, target_context, data)

    raw_payload, version = session.execute(
        text("SELECT payload::text, crypto_version FROM memories WHERE space_id = :s"),
        {"s": target.id},
    ).one()
    assert TITLE not in raw_payload
    assert version == 2
    imported = session.query(Memory).filter(Memory.space_id == target.id).one()
    assert imported.payload.title == TITLE
    assert imported.payload.tags == ["home"]
    imported_heart = session.query(HeartMoment).filter(HeartMoment.space_id == target.id).one()
    assert imported_heart.payload.text == ""
    assert imported_heart.payload.tags == ["everyday"]
    assert imported_heart.payload.location == HeartMomentLocation(
        name="Transported lake", latitude=49.1, longitude=7.2
    )
    assert session.query(Plan).filter(Plan.space_id == target.id).one().payload.tags == ["Concert"]
    assert session.query(Wish).filter(Wish.space_id == target.id).one().payload.tags == ["Summer"]
