"""Migration preserves identity and independent private-date boundaries."""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
from runpy import run_path
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from alembic import op
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from eimir.authorization import AuthorizationContext
from eimir.db.base import Base
from eimir.people.models import ImportantDate, RelatedPerson
from eimir.relationship import service as relationship_service
from eimir.transfer import jobs
from eimir.transfer import service as transfer_service
from eimir.transfer.archive import TransferArchiveError
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, make_space, requires_database
from tests.integration.test_related_persons import couple as couple
from tests.integration.test_related_persons import (
    create_date,
    create_person,
    dates_path,
    persons_path,
)

pytestmark = [pytest.mark.integration, requires_database]


def test_legacy_person_is_shared_once_without_opening_linked_private_dates(client, session, couple):  # type: ignore[no-untyped-def]
    person = create_person(client, couple, show_birthday_on_dashboard=True).json()
    private = create_date(
        client, couple, related_person_id=person["id"], visibility="PRIVATE"
    ).json()
    connection = session.connection()
    context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
    with Operations.context(context):
        op.drop_constraint("people_are_shared", "related_persons", type_="check")
    session.execute(
        text("UPDATE related_persons SET privacy_class = 'OWNER_ONLY' WHERE id = :id"),
        {"id": person["id"]},
    )
    before = dict(
        session.execute(text("SELECT * FROM related_persons WHERE id = :id"), {"id": person["id"]})
        .mappings()
        .one()
    )
    with Operations.context(context):
        run_path(
            str(Path(__file__).resolve().parents[2] / "alembic/versions/0116_shared_people.py")
        )["upgrade"]()
    session.expire_all()
    after = dict(
        session.execute(text("SELECT * FROM related_persons WHERE id = :id"), {"id": person["id"]})
        .mappings()
        .one()
    )
    assert after["privacy_class"] == "SPACE_SHARED"
    assert after["version"] == before["version"] + 1
    for field in (
        "id",
        "space_id",
        "owner_id",
        "payload",
        "birthday",
        "birthday_year_known",
        "avatar_attachment_id",
        "show_birthday_on_dashboard",
    ):
        assert after[field] == before[field]
    linked = (
        session.execute(
            text(
                "SELECT privacy_class, related_person_privacy_class, related_person_id "
                "FROM important_dates WHERE id = :id"
            ),
            {"id": private["id"]},
        )
        .mappings()
        .one()
    )
    assert linked["privacy_class"] == "OWNER_ONLY"
    assert linked["related_person_privacy_class"] == "SPACE_SHARED"
    assert str(linked["related_person_id"]) == person["id"]
    assert (
        client.get(
            f"{persons_path(couple['space'].id)}/{person['id']}", headers=auth(couple["token_b"])
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"{dates_path(couple['space'].id)}/{private['id']}", headers=auth(couple["token_b"])
        ).status_code
        == 404
    )


@pytest.mark.parametrize("copied_class", ["OWNER_ONLY", "SPACE_SHARED"])
def test_legacy_bundle_preserves_dates_and_rejects_mismatched_parent_class(
    client, session, couple, copied_class
):  # type: ignore[no-untyped-def]
    person = create_person(client, couple, note="Remember the annual seaside walk.").json()
    create_date(client, couple, related_person_id=person["id"], visibility="PRIVATE")
    source = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    target_space = make_space(session, couple["anna"])
    relationship_service.add_member(session, target_space.id, couple["ben"])
    target = AuthorizationContext(account_id=couple["anna"].id, space_id=target_space.id)
    with (
        transfer_service.build_export_archive(session, source, TransferScope.PERSONAL) as current,
        ZipFile(current) as archive,
    ):
        entries = {name: archive.read(name) for name in archive.namelist()}
    people = json.loads(entries["people.json"])
    for table in people["tables"]:
        for row in table["rows"]:
            if table["name"] == "related_persons":
                row["privacyClass"] = "OWNER_ONLY"
            if table["name"] == "important_dates":
                row["relatedPersonPrivacyClass"] = copied_class
    entries["people.json"] = (json.dumps(people) + "\n").encode()
    manifest = json.loads(entries["manifest.json"])
    manifest["checksums"]["people.json"] = hashlib.sha256(entries["people.json"]).hexdigest()
    entries["manifest.json"] = (json.dumps(manifest) + "\n").encode()
    legacy = io.BytesIO()
    with ZipFile(legacy, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    legacy.seek(0)
    if copied_class != "OWNER_ONLY":
        with pytest.raises(TransferArchiveError) as caught:
            transfer_service.validate_import_bundle(
                session, target, legacy, compressed_size=len(legacy.getvalue())
            )
        assert caught.value.code == "TRANSFER_RELATION_INVALID"
        assert session.query(RelatedPerson).filter_by(space_id=target_space.id).count() == 0
        return
    transfer_service.validate_import_bundle(
        session, target, legacy, compressed_size=len(legacy.getvalue())
    )
    legacy.seek(0)
    imported = transfer_service.create_import(session, target, legacy, size=len(legacy.getvalue()))
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(imported.id)})
    assert imported.status == ImportStatus.READY_TO_APPLY.value
    transfer_service.request_apply(session, target, str(imported.id))
    session.flush()
    jobs.handle_apply_import(session, {"importId": str(imported.id)})
    assert imported.status == ImportStatus.COMPLETED.value
    imported_person = session.query(RelatedPerson).filter_by(space_id=target_space.id).one()
    imported_date = session.query(ImportantDate).filter_by(space_id=target_space.id).one()
    assert imported_person.privacy_class == "SPACE_SHARED"
    assert imported_person.payload.display_name == person["displayName"]
    assert imported_person.payload.note == person["note"]
    assert imported_date.related_person_id == imported_person.id
    assert imported_date.related_person_privacy_class == "SPACE_SHARED"
    assert imported_date.privacy_class == "OWNER_ONLY"
    partner_dates = client.get(dates_path(target_space.id), headers=auth(couple["token_b"]))
    assert partner_dates.status_code == 200
    assert partner_dates.json() == []


def test_concrete_relationship_upgrade_and_rollback_preserve_protected_content(
    client, session, couple
):  # type: ignore[no-untyped-def]
    person = create_person(
        client, couple, relationship="DAUGHTER", note="A remembered detail."
    ).json()
    connection = session.connection()
    context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
    migration = run_path(
        str(Path(__file__).resolve().parents[2] / "alembic/versions/0117_person_relationships.py")
    )
    with Operations.context(context):
        migration["downgrade"]()
    session.expire_all()
    row = session.get(RelatedPerson, person["id"])
    assert row.relationship == "CHILD"
    assert row.version == person["version"] + 1
    assert row.payload.note == person["note"]
    with Operations.context(context):
        migration["upgrade"]()
    changed = client.put(
        f"{persons_path(couple['space'].id)}/{person['id']}",
        json={
            "displayName": person["displayName"],
            "relationship": "GRANDMOTHER",
            "birthday": person["birthday"],
            "birthdayYearKnown": True,
        },
        headers={**auth(couple["token_a"]), "If-Match": str(row.version)},
    )
    assert changed.status_code == 200
    assert changed.json()["relationship"] == "GRANDMOTHER"
    assert changed.json()["note"] == person["note"]
