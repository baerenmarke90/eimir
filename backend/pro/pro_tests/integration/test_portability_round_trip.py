"""Operator export to a file and operator import back, against PostgreSQL (Decision 0020).

These tests move the evidence of the former Core Transfer Bundle tests to the tool: privacy
scopes, member mapping, record graph rewriting and idempotence. Nothing here uses a job, an
API route or a Transfer table.
"""

from __future__ import annotations

import io
import json
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from eimir_pro.portability.archive import TransferArchiveError
from eimir_pro.portability.common import TransferScope
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.appearance.models import AppIconPreference
from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.collections import service as collection_service
from eimir.collections.models import Collection, CollectionKind, CollectionSuggestion
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.identity.models import AccountEmail
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.milestones import service as milestone_service
from eimir.milestones.models import Milestone
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.plans import service as plan_service
from eimir.plans.models import Plan
from eimir.private_notes import service as private_note_service
from eimir.profiles import service as profile_service
from eimir.profiles.models import PartnerProfile
from eimir.relations import service as relation_service
from eimir.relations.models import HeartMomentPlan, MilestonePlan, PlanCollection, PlanNote
from eimir.relationship import service as relationship_service
from eimir.reminders.runtime_models import RulePreference
from eimir.shared_notes import service as shared_note_service
from eimir.shared_notes.models import SharedNote
from eimir.wishes import service as wish_service
from eimir.wishes.models import Wish
from pro_tests.support.portability import (
    couple,
    export_bytes,
    import_bytes,
    target_space,
    validate_bytes,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _verified_email(session: Session, account, address: str) -> None:  # type: ignore[no-untyped-def]
    session.add(
        AccountEmail(
            account_id=account.id,
            email=address,
            verified_at=datetime(2026, 8, 31, 10, 0, tzinfo=UTC),
            is_primary=True,
        )
    )
    session.flush()


def _minimal_personal_bundle(
    source_id: str, email: str | None, *, appearance: dict[str, str] | None = None
) -> bytes:
    import hashlib
    from zipfile import ZIP_DEFLATED

    account_document: dict[str, object] = {
        "members": [
            {
                "sourceId": source_id,
                "displayName": "Portable member",
                "birthday": None,
                "locale": "de-DE",
                "timezone": "Europe/Berlin",
                "verifiedEmail": email,
            }
        ]
    }
    if appearance is not None:
        account_document["personalAppearance"] = appearance
    accounts = (json.dumps(account_document, sort_keys=True, separators=(",", ":")) + "\n").encode()
    manifest = {
        "formatVersion": 1,
        "exportedAt": "2026-08-31T10:00:00+00:00",
        "applicationVersion": "0.1.0",
        "scope": "PERSONAL",
        "sourceSpaceId": str(uuid4()),
        "exportedBySourceId": source_id,
        "personalOwnerSourceId": source_id,
        "checksums": {"accounts.json": hashlib.sha256(accounts).hexdigest()},
    }
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("accounts.json", accounts)
        archive.writestr(
            "manifest.json",
            (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode(),
        )
    return output.getvalue()


def test_shared_export_excludes_owner_only_and_personal_keeps_only_requester(
    session: Session, tmp_path: Path
) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    anna_context = AuthorizationContext(account_id=anna.id, space_id=space.id)
    ben_context = AuthorizationContext(account_id=ben.id, space_id=space.id)

    private_note_service.create_note(
        session, anna_context, title="Anna secret", body="Only Anna may export this.", pinned=False
    )
    private_note_service.create_note(
        session,
        ben_context,
        title="Ben secret",
        body="Anna must never export this.",
        pinned=False,
    )
    profile_service.set_partner_nickname(
        session, anna_context, "Anna's private label", expected_version=0
    )
    profile_service.set_partner_nickname(
        session, ben_context, "Ben's private label", expected_version=0
    )
    session.add_all(
        [
            RulePreference(
                account_id=anna.id,
                space_id=space.id,
                rule_key="portable-test-rule",
                enabled=False,
                parameters={"days_before": [7]},
            ),
            RulePreference(
                account_id=ben.id,
                space_id=space.id,
                rule_key="portable-test-rule",
                enabled=True,
                parameters={"days_before": [1]},
            ),
        ]
    )
    session.flush()

    with ZipFile(io.BytesIO(export_bytes(session, anna_context, tmp_path))) as archive:
        assert "private/notes.json" not in archive.namelist()
        assert "rules.json" not in archive.namelist()
        shared_profiles = json.loads(archive.read("profiles.json"))
        shared_accounts = json.loads(archive.read("accounts.json"))
    assert all(group["name"] != "partner_nicknames" for group in shared_profiles["tables"])
    # Personal-only account metadata never travels in a shared bundle.
    assert "personalPhotoSources" not in shared_accounts

    personal = export_bytes(session, anna_context, tmp_path, TransferScope.PERSONAL)
    with ZipFile(io.BytesIO(personal)) as archive:
        private_document = json.loads(archive.read("private/notes.json"))
        rule_document = json.loads(archive.read("rules.json"))
        personal_profiles = json.loads(archive.read("profiles.json"))
        personal_accounts = json.loads(archive.read("accounts.json"))

    notes = next(group for group in private_document["tables"] if group["name"] == "private_notes")[
        "rows"
    ]
    rules = next(group for group in rule_document["tables"] if group["name"] == "rule_preferences")[
        "rows"
    ]
    nicknames = next(
        group for group in personal_profiles["tables"] if group["name"] == "partner_nicknames"
    )["rows"]
    assert len(notes) == 1
    assert notes[0]["ownerId"] == str(anna.id)
    assert notes[0]["payload"]["title"] == "Anna secret"
    assert len(rules) == 1
    assert rules[0]["accountId"] == str(anna.id)
    assert rules[0]["enabled"] is False
    assert len(nicknames) == 1
    assert nicknames[0]["ownerId"] == str(anna.id)
    assert nicknames[0]["accountId"] == str(ben.id)
    assert nicknames[0]["payload"]["nickname"] == "Anna's private label"
    # The Pro photo-source markers are read from the Pro tables, not through a Core hook.
    assert personal_accounts["personalPhotoSources"] == []
    assert "Ben secret" not in personal.decode("latin-1")


def test_the_manifest_names_the_schema_revision_it_was_exported_at(
    session: Session, tmp_path: Path
) -> None:
    pair = couple(session)
    data = export_bytes(session, pair["context"], tmp_path, schema_revision="0174")
    with ZipFile(io.BytesIO(data)) as archive:
        assert json.loads(archive.read("manifest.json"))["schemaRevision"] == "0174"
    untagged = export_bytes(session, pair["context"], tmp_path)
    with ZipFile(io.BytesIO(untagged)) as archive:
        assert "schemaRevision" not in json.loads(archive.read("manifest.json"))


def test_a_bundle_of_another_schema_revision_is_refused_before_anything_is_written(
    session: Session, tmp_path: Path
) -> None:
    from eimir_pro.portability.common import PortabilityError

    pair = couple(session)
    target = target_space(session, pair)
    data = export_bytes(session, pair["context"], tmp_path, schema_revision="0001")
    with pytest.raises(PortabilityError, match="0001"):
        import_bytes(session, target, data, expected_schema_revision="0174")
    # Without a pinned revision (and for files that carry none) the bundle is judged on content.
    assert import_bytes(session, target, data).summary["scope"] == "SHARED"


def test_shared_round_trip_maps_email_less_pair_and_reuses_target_profiles(
    session: Session, tmp_path: Path
) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    source_space = make_space(session, anna)
    relationship_service.add_member(session, source_space.id, ben)
    target_space_row = make_space(session, anna)
    relationship_service.add_member(session, target_space_row.id, ben)
    source_authorization = AuthorizationContext(account_id=anna.id, space_id=source_space.id)
    target_authorization = AuthorizationContext(account_id=anna.id, space_id=target_space_row.id)
    target_profile_ids = set(
        session.execute(
            select(PartnerProfile.id).where(PartnerProfile.space_id == target_space_row.id)
        ).scalars()
    )
    assert len(target_profile_ids) == 2

    memory = memory_service.create_memory(
        session,
        source_authorization,
        title="Portable day",
        body="Together",
        happened_on=date(2026, 9, 1),
        tags=["home", "Our first summer"],
    )
    heart = heart_moment_service.create_heart_moment(
        session,
        source_authorization,
        text="",
        emotion=HeartEmotion.HAPPY,
        visibility=ContentVisibility.SHARED,
        happened_on=date(2026, 9, 1),
        tags=["everyday", "Our tradition"],
    )
    place = place_service.create_place(
        session,
        source_authorization,
        name="Portable place",
        description=None,
        address=None,
        latitude=None,
        longitude=None,
    )
    place_service.update_place(
        session,
        source_authorization,
        place.id,
        expected_version=place.version,
        changed_fields=frozenset({"archived"}),
        archived=True,
        name=None,
        description=None,
        address=None,
        latitude=None,
        longitude=None,
    )
    plan = plan_service.create_plan(
        session, source_authorization, title="Portable trip", description=None, place_id=place.id
    )
    milestone = milestone_service.create_milestone(
        session,
        source_authorization,
        title="Portable milestone",
        body=None,
        happened_on=date(2026, 9, 1),
    )
    for source, kind in (
        (memory, relation_service.MEMORY_PLANS),
        (heart, relation_service.HEART_MOMENT_PLANS),
        (milestone, relation_service.MILESTONE_PLANS),
    ):
        relation_service.link(session, source_authorization, source.id, plan.id, kind)
    collection = collection_service.create_collection(
        session, source_authorization, title="Portable packing"
    )
    collection_service.create_item(
        session, source_authorization, collection.id, title="Camera", completed=True
    )
    relation_service.link(
        session, source_authorization, plan.id, collection.id, relation_service.PLAN_COLLECTIONS
    )
    shared_note = shared_note_service.create_note(
        session, source_authorization, title="Portable note", body="Door code 4172"
    )
    relation_service.link(
        session, source_authorization, plan.id, shared_note.id, relation_service.PLAN_NOTES
    )

    data = export_bytes(session, source_authorization, tmp_path)
    graph = validate_bytes(session, target_authorization, data)
    assert graph.mapping == {anna.id: anna.id, ben.id: ben.id}
    import_bytes(session, target_authorization, data)

    imported_target_profile_ids = set(
        session.execute(
            select(PartnerProfile.id).where(PartnerProfile.space_id == target_space_row.id)
        ).scalars()
    )
    assert imported_target_profile_ids == target_profile_ids
    imported_memory = session.execute(
        select(Memory).where(Memory.space_id == target_space_row.id)
    ).scalar_one()
    imported_heart = session.execute(
        select(HeartMoment).where(HeartMoment.space_id == target_space_row.id)
    ).scalar_one()
    imported_place = session.scalars(
        select(Place).where(Place.space_id == target_space_row.id)
    ).one()
    assert imported_place.archived is True
    assert imported_place.payload.name == "Portable place"
    assert imported_memory.payload.tags == ["home", "Our first summer"]
    assert imported_heart.payload.tags == ["everyday", "Our tradition"]

    imported_plan = session.scalars(select(Plan).where(Plan.space_id == target_space_row.id)).one()
    imported_collection = session.scalars(
        select(Collection).where(Collection.space_id == target_space_row.id)
    ).one()
    imported_link = session.scalars(
        select(PlanCollection).where(PlanCollection.space_id == target_space_row.id)
    ).one()
    assert imported_plan.place_id == imported_place.id
    assert imported_plan.id != plan.id
    assert imported_collection.id != collection.id
    assert imported_link.plan_id == imported_plan.id
    assert imported_link.collection_id == imported_collection.id
    assert collection_service.list_items(session, imported_collection)[0].completed is True
    imported_note = session.scalars(
        select(SharedNote).where(SharedNote.space_id == target_space_row.id)
    ).one()
    imported_note_link = session.scalars(
        select(PlanNote).where(PlanNote.space_id == target_space_row.id)
    ).one()
    assert imported_note.id != shared_note.id
    assert imported_note.payload.title == "Portable note"
    assert imported_note.payload.body == "Door code 4172"
    assert imported_note.edited_by == imported_note.owner_id
    assert imported_note_link.plan_id == imported_plan.id
    assert imported_note_link.note_id == imported_note.id
    imported_milestone = session.scalars(
        select(Milestone).where(Milestone.space_id == target_space_row.id)
    ).one()
    for source, kind in (
        (imported_memory, relation_service.MEMORY_PLANS),
        (imported_heart, relation_service.HEART_MOMENT_PLANS),
        (imported_milestone, relation_service.MILESTONE_PLANS),
    ):
        assert relation_service.list_targets(session, target_authorization, source.id, kind) == [
            imported_plan.id
        ]
    assert (
        session.scalars(
            select(HeartMomentPlan).where(HeartMomentPlan.space_id == target_space_row.id)
        )
        .one()
        .source_privacy_class
        == "SPACE_SHARED"
    )
    assert (
        session.scalars(select(MilestonePlan).where(MilestonePlan.space_id == target_space_row.id))
        .one()
        .plan_id
        == imported_plan.id
    )


def test_personal_import_maps_requester_ignores_appearance_and_is_idempotent(
    session: Session,
) -> None:
    target = make_account(session, "Target")
    _verified_email(session, target, "target@example.test")
    space = make_space(session, target)
    authorization = AuthorizationContext(account_id=target.id, space_id=space.id)
    source_id = str(uuid4())
    data = _minimal_personal_bundle(
        source_id,
        "target@example.test",
        appearance={"appIconId": "sage", "wirDesign": "shared_album", "memoryWorld": "crate"},
    )

    graph = validate_bytes(session, authorization, data)
    assert graph.scope is TransferScope.PERSONAL
    assert graph.mapping == {UUID(source_id): target.id}
    assert graph.summary == {
        "scope": "PERSONAL",
        "recordCounts": {},
        "mediaCount": 0,
        "sourceMemberCount": 1,
        "alreadyPresentCount": 0,
        "newMediaCount": 0,
        "newMediaBytes": 0,
        "newVideoCount": 0,
    }

    first = import_bytes(session, authorization, data)
    second = import_bytes(session, authorization, data)
    assert first.written_keys == second.written_keys == []
    # Export-only appearance never changes an installation.
    assert (
        session.scalar(
            select(AppIconPreference).where(
                AppIconPreference.account_id == target.id,
                AppIconPreference.space_id == space.id,
            )
        )
        is None
    )


def test_personal_import_fails_when_owner_maps_to_other_member(session: Session) -> None:
    requester = make_account(session, "Requester")
    partner = make_account(session, "Partner")
    _verified_email(session, requester, "requester@example.test")
    _verified_email(session, partner, "partner@example.test")
    space = make_space(session, requester)
    relationship_service.add_member(session, space.id, partner)
    authorization = AuthorizationContext(account_id=requester.id, space_id=space.id)
    data = _minimal_personal_bundle(str(uuid4()), "partner@example.test")

    with pytest.raises(TransferArchiveError) as caught:
        validate_bytes(session, authorization, data)
    assert caught.value.code == "TRANSFER_MEMBER_MAPPING_INVALID"


def test_explicit_member_mapping_overrides_stale_emails(session: Session, tmp_path: Path) -> None:
    """The operator names who is who with ``--map`` when the verified emails point elsewhere."""
    from pro_tests.support.portability import forge

    source_pair = couple(session)
    memory_service.create_memory(
        session,
        source_pair["context"],
        title="Mapped day",
        body="Together",
        happened_on=date(2026, 9, 1),
    )
    data = export_bytes(session, source_pair["context"], tmp_path)

    # The bundle's emails are swapped against the target members: Anna's email now belongs
    # to the target's second member and the other way round.
    def swap_emails(entries: dict[str, bytes]) -> None:
        document = json.loads(entries["accounts.json"])
        for member in document["members"]:
            owner = "anna" if member["sourceId"] == str(source_pair["anna"].id) else "ben"
            member["verifiedEmail"] = {"anna": "q@example.test", "ben": "p@example.test"}[owner]
        entries["accounts.json"] = json.dumps(document).encode()

    data = forge(data, swap_emails)
    p, q = make_account(session, "P"), make_account(session, "Q")
    _verified_email(session, p, "p@example.test")
    _verified_email(session, q, "q@example.test")
    target = make_space(session, p)
    relationship_service.add_member(session, target.id, q)
    session.flush()
    context = AuthorizationContext(account_id=p.id, space_id=target.id)

    # By email the exporter would map to Q, but the operator says the exporter is P.
    with pytest.raises(TransferArchiveError) as caught:
        validate_bytes(session, context, data)
    assert caught.value.code == "TRANSFER_MEMBER_MAPPING_INVALID"

    overrides = {source_pair["anna"].id: p.id, source_pair["ben"].id: q.id}
    assert validate_bytes(session, context, data, overrides=overrides).mapping == overrides
    import_bytes(session, context, data, overrides=overrides)
    imported = session.scalars(select(Memory).where(Memory.space_id == target.id)).one()
    assert imported.owner_id == p.id


@pytest.mark.parametrize("case", ["unknown-source", "foreign-target", "target-twice"])
def test_an_explicit_mapping_must_name_real_members_once(
    session: Session, tmp_path: Path, case: str
) -> None:
    pair = couple(session)
    outsider = make_account(session, "Outsider")
    target = target_space(session, pair)
    data = export_bytes(session, pair["context"], tmp_path)
    anna, ben = pair["anna"].id, pair["ben"].id
    overrides = {
        "unknown-source": {uuid4(): anna},
        "foreign-target": {anna: outsider.id},
        "target-twice": {anna: anna, ben: anna},
    }[case]
    with pytest.raises(TransferArchiveError) as caught:
        validate_bytes(session, target, data, overrides=overrides)
    assert caught.value.code == "TRANSFER_MEMBER_MAPPING_INVALID"


def test_import_remaps_repeated_wish_links_and_series(session: Session, tmp_path: Path) -> None:
    """#1816: follow-up links and series IDs are remapped to the imported Wishes."""
    pair = couple(session)
    target = target_space(session, pair)
    source_authorization = pair["context"]

    first = wish_service.create_wish(session, source_authorization, title="Baltic Sea")
    first = wish_service.complete_direct_wish(
        session, source_authorization, first.id, expected_version=first.version
    )
    second = wish_service.repeat_wish_once(
        session, source_authorization, first.id, idempotency_key=None
    ).wish
    second = wish_service.complete_direct_wish(
        session, source_authorization, second.id, expected_version=second.version
    )
    third = wish_service.repeat_wish_once(
        session, source_authorization, second.id, idempotency_key=None
    ).wish
    session.flush()

    import_bytes(session, target, export_bytes(session, source_authorization, tmp_path))

    imported = {
        wish.series_position: wish
        for wish in session.scalars(select(Wish).where(Wish.space_id == target.space_id))
    }
    assert set(imported) == {1, 2, 3}
    assert imported[1].followed_from_wish_id is None
    assert imported[2].followed_from_wish_id == imported[1].id
    assert imported[3].followed_from_wish_id == imported[2].id
    assert {wish.series_id for wish in imported.values()} == {imported[1].id}
    assert imported[3].id != third.id


def test_shopping_suggestions_travel_with_their_list_in_a_shared_round_trip(
    session: Session, tmp_path: Path
) -> None:
    pair = couple(session)
    target = target_space(session, pair)
    source_authorization = pair["context"]
    shopping = collection_service.create_collection(
        session, source_authorization, title="Einkauf", kind=CollectionKind.SHOPPING
    )
    milk = collection_service.create_item(
        session,
        source_authorization,
        shopping.id,
        title="Milch",
        quantity="2 l",
        completed=True,
    )
    collection_service.finish_shopping(
        session, source_authorization, shopping.id, item_ids=[milk.id]
    )

    import_bytes(session, target, export_bytes(session, source_authorization, tmp_path))

    imported = session.scalars(
        select(Collection).where(Collection.space_id == target.space_id)
    ).one()
    assert imported.kind == CollectionKind.SHOPPING.value
    suggestions = session.scalars(
        select(CollectionSuggestion).where(CollectionSuggestion.collection_id == imported.id)
    ).all()
    assert [
        (item.payload.title, item.payload.quantity, item.times_bought) for item in suggestions
    ] == [("Milch", "2 l", 1)]
    assert collection_service.list_items(session, imported) == []


def _legacy_plan_row(row):  # type: ignore[no-untyped-def]
    legacy = {key: value for key, value in row.items() if key != "anticipation"}
    legacy["anticipationEnabled"] = row["anticipation"] == "ALWAYS"
    return legacy


@pytest.mark.parametrize("legacy", [False, True])
def test_import_keeps_the_countdown_preference_and_upgrades_the_legacy_flag(
    session: Session, tmp_path: Path, legacy: bool
) -> None:
    """#2158 D: a pinned Plan stays pinned; a legacy false is automatic, not never."""
    from pro_tests.support.portability import forge

    pair = couple(session)
    target = target_space(session, pair)
    for title, anticipation in (("Pinned", "ALWAYS"), ("Hidden", "NEVER"), ("Auto", "AUTOMATIC")):
        plan = plan_service.create_plan(
            session,
            pair["context"],
            title=title,
            description=None,
            place_id=None,
            planned_on=date(2099, 1, 1),
        )
        plan.anticipation = anticipation
    session.flush()
    data = export_bytes(session, pair["context"], tmp_path)

    def rewrite(entries: dict[str, bytes]) -> None:
        document = json.loads(entries["plans.json"])
        for group in document["tables"]:
            if group["name"] == "plans":
                group["rows"] = [_legacy_plan_row(row) for row in group["rows"]]
        entries["plans.json"] = json.dumps(document).encode()

    import_bytes(session, target, forge(data, rewrite) if legacy else data)

    imported = {
        plan.payload.title: plan.anticipation
        for plan in session.scalars(select(Plan).where(Plan.space_id == target.space_id))
    }
    hidden = "AUTOMATIC" if legacy else "NEVER"
    assert imported == {"Pinned": "ALWAYS", "Hidden": hidden, "Auto": "AUTOMATIC"}
