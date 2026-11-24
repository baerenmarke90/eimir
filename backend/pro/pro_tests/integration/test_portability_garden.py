"""The garden travels with a Space in the operator export and import (Decision 0020, slice S1b).

Covers the round trip with waterings and bouquets, the account mapping in both directions
(including the ``flower_senders`` array), the rules of the import (an empty target garden, both
persons connected, hostile files refused before anything is written) and the reason the operator
connects both persons first: a joining or leaving partner purges the garden.
"""

from __future__ import annotations

import io
import json
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from eimir_pro.garden.models import (
    Garden,
    GardenBouquet,
    GardenPlant,
    GardenReader,
    GardenVisitorName,
    GardenWatering,
)
from eimir_pro.portability import garden as garden_rules
from eimir_pro.portability.allowlist import GARDEN_TABLES
from eimir_pro.portability.archive import TransferArchiveError
from eimir_pro.portability.common import TransferScope
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership
from pro_tests.support.portability import (
    couple,
    export_bytes,
    forge,
    import_bytes,
    target_space,
    validate_bytes,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

MOMENT = datetime(2026, 11, 20, 9, 30, tzinfo=UTC)
MODELS = (Garden, GardenPlant, GardenWatering, GardenReader, GardenVisitorName, GardenBouquet)


def _plant(space_id: UUID, sender: UUID, receiver: UUID, **values: Any) -> GardenPlant:
    fields: dict[str, Any] = {
        "species": "TULIP",
        "words": None,
        "sent_on": date(2026, 11, 1),
        "planted_at": MOMENT,
        "slot": 0,
        "stage": 1,
        "in_pond": False,
        "bloomed": False,
        "bloomed_on": None,
        **values,
    }
    return GardenPlant(space_id=space_id, sender_id=sender, receiver_id=receiver, **fields)


def _grow_garden(session: Session, pair: dict[str, Any]) -> dict[str, UUID]:
    """A garden with a planted tulip, a lily in the pond, a seed, waterings and a bouquet."""
    space_id, anna, ben = pair["space"].id, pair["anna"].id, pair["ben"].id
    tulip = _plant(
        space_id,
        anna,
        ben,
        words="FOR_YOU",
        stage=3,
        bloomed=True,
        bloomed_on=date(2026, 11, 6),
    )
    lily = _plant(
        space_id,
        ben,
        anna,
        species="WATER_LILY",
        sent_on=date(2026, 11, 2),
        in_pond=True,
        stage=2,
    )
    seed = _plant(
        space_id,
        anna,
        ben,
        species="POPPY",
        sent_on=date(2026, 11, 3),
        planted_at=None,
        slot=None,
        stage=0,
    )
    session.add_all(
        [
            Garden(space_id=space_id, name="Our little patch", updated_at=MOMENT),
            GardenVisitorName(space_id=space_id, animal="DUCKS", name="Quack", updated_at=MOMENT),
            GardenReader(space_id=space_id, account_id=anna, seen_shared_days=4),
            GardenReader(space_id=space_id, account_id=ben, seen_shared_days=2),
            tulip,
            lily,
            seed,
        ]
    )
    session.flush()
    session.add_all(
        [
            GardenWatering(
                space_id=space_id, account_id=anna, plant_id=tulip.id, watered_on=date(2026, 11, 7)
            ),
            GardenWatering(
                space_id=space_id, account_id=ben, plant_id=tulip.id, watered_on=date(2026, 11, 7)
            ),
            GardenBouquet(
                space_id=space_id,
                giver_id=anna,
                receiver_id=ben,
                given_on=date(2026, 11, 8),
                flowers=["TULIP", "WATER_LILY"],
                flower_senders=[anna, ben],
                closed_at=MOMENT,
                kept=True,
            ),
        ]
    )
    session.flush()
    return {"tulip": tulip.id, "lily": lily.id, "seed": seed.id}


def _rows(session: Session, space_id: UUID) -> dict[str, list[Any]]:
    session.expire_all()
    return {
        model.__tablename__: list(session.scalars(select(model).where(model.space_id == space_id)))
        for model in MODELS
    }


def _row_count(session: Session, space_id: UUID) -> int:
    return sum(len(rows) for rows in _rows(session, space_id).values())


def _second_pair(session: Session) -> tuple[AuthorizationContext, UUID, UUID]:
    """A Space of two other people: its target context (the first one) and both account IDs."""
    cara, dan = make_account(session, "Cara"), make_account(session, "Dan")
    space = make_space(session, cara)
    relationship_service.add_member(session, space.id, dan)
    session.flush()
    return AuthorizationContext(account_id=cara.id, space_id=space.id), cara.id, dan.id


@pytest.fixture
def bundle(session: Session, tmp_path: Path):  # type: ignore[no-untyped-def]
    pair = couple(session)
    plants = _grow_garden(session, pair)
    return {**pair, **plants, "data": export_bytes(session, pair["context"], tmp_path)}


def _garden_document(data: bytes) -> dict[str, list[dict[str, Any]]]:
    with ZipFile(io.BytesIO(data)) as archive:
        document = json.loads(archive.read("garden.json"))
    return {table["name"]: table["rows"] for table in document["tables"]}


def _forged(data: bytes, edit: Callable[[dict[str, list[dict[str, Any]]]], None]) -> bytes:
    def change(entries: dict[str, bytes]) -> None:
        document = json.loads(entries["garden.json"])
        tables = {table["name"]: table["rows"] for table in document["tables"]}
        edit(tables)
        entries["garden.json"] = json.dumps(document).encode()

    return forge(data, change)


def test_the_garden_round_trips_with_waterings_and_bouquets(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    tables = _garden_document(bundle["data"])
    assert set(tables) == set(GARDEN_TABLES)
    assert len(tables["garden_plants"]) == 3 and len(tables["garden_waterings"]) == 2

    context = target_space(session, bundle)
    dry = validate_bytes(session, context, bundle["data"])
    assert dry.summary["garden"] == garden_rules.INCLUDED
    assert _row_count(session, context.space_id) == 0, "a dry run writes nothing"

    result = import_bytes(session, context, bundle["data"])
    assert result.summary["garden"] == garden_rules.INCLUDED
    imported = _rows(session, context.space_id)
    assert {name: len(rows) for name, rows in imported.items()} == {
        "gardens": 1,
        "garden_plants": 3,
        "garden_waterings": 2,
        "garden_readers": 2,
        "garden_visitor_names": 1,
        "garden_bouquets": 1,
    }
    assert imported["gardens"][0].name == "Our little patch"
    assert imported["garden_visitor_names"][0].animal == "DUCKS"
    by_species = {plant.species: plant for plant in imported["garden_plants"]}
    assert by_species["TULIP"].stage == 3 and by_species["TULIP"].bloomed_on == date(2026, 11, 6)
    assert by_species["WATER_LILY"].in_pond and by_species["WATER_LILY"].slot == 0
    assert by_species["POPPY"].planted_at is None and by_species["POPPY"].slot is None
    # Plant IDs are rewritten, and a watering follows its plant to the new ID.
    plant_ids = {plant.id for plant in imported["garden_plants"]}
    assert plant_ids.isdisjoint({bundle["tulip"], bundle["lily"], bundle["seed"]})
    assert {watering.plant_id for watering in imported["garden_waterings"]} == {
        by_species["TULIP"].id
    }
    # The source garden is untouched.
    assert _row_count(session, bundle["space"].id) == 1 + 3 + 2 + 2 + 1 + 1


def test_accounts_are_mapped_into_the_target_including_the_flower_senders(  # type: ignore[no-untyped-def]
    session: Session, bundle
) -> None:
    context, cara, dan = _second_pair(session)
    import_bytes(session, context, bundle["data"])  # Cara exported as Anna, so Anna -> Cara

    imported = _rows(session, context.space_id)
    tulip = next(plant for plant in imported["garden_plants"] if plant.species == "TULIP")
    lily = next(plant for plant in imported["garden_plants"] if plant.species == "WATER_LILY")
    assert (tulip.sender_id, tulip.receiver_id) == (cara, dan)
    assert (lily.sender_id, lily.receiver_id) == (dan, cara)
    assert {
        reader.account_id: reader.seen_shared_days for reader in imported["garden_readers"]
    } == {
        cara: 4,
        dan: 2,
    }
    assert {watering.account_id for watering in imported["garden_waterings"]} == {cara, dan}
    (bouquet,) = imported["garden_bouquets"]
    assert (bouquet.giver_id, bouquet.receiver_id) == (cara, dan)
    assert bouquet.flowers == ["TULIP", "WATER_LILY"]
    assert list(bouquet.flower_senders) == [cara, dan], "the array keeps its order"


def test_the_mapping_works_in_the_other_direction_too(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    context, cara, dan = _second_pair(session)
    # Dan runs the import, so the exporting member Anna maps to Dan and Ben to Cara.
    reversed_context = AuthorizationContext(account_id=dan, space_id=context.space_id)
    import_bytes(session, reversed_context, bundle["data"])

    imported = _rows(session, context.space_id)
    tulip = next(plant for plant in imported["garden_plants"] if plant.species == "TULIP")
    assert (tulip.sender_id, tulip.receiver_id) == (dan, cara)
    (bouquet,) = imported["garden_bouquets"]
    assert (bouquet.giver_id, bouquet.receiver_id) == (dan, cara)
    assert list(bouquet.flower_senders) == [dan, cara]
    assert {
        reader.account_id: reader.seen_shared_days for reader in imported["garden_readers"]
    } == {
        dan: 4,
        cara: 2,
    }


def test_the_same_file_again_adds_nothing_to_a_garden_that_is_no_longer_empty(  # type: ignore[no-untyped-def]
    session: Session, bundle
) -> None:
    context = target_space(session, bundle)
    import_bytes(session, context, bundle["data"])
    first = {
        name: [row.id for row in rows if hasattr(row, "id")]
        for name, rows in _rows(session, context.space_id).items()
    }

    again = import_bytes(session, context, bundle["data"])
    assert again.summary["garden"] == garden_rules.SKIPPED_NOT_EMPTY
    assert {
        name: [row.id for row in rows if hasattr(row, "id")]
        for name, rows in _rows(session, context.space_id).items()
    } == first
    assert _row_count(session, context.space_id) == 10


def test_a_garden_the_target_already_has_is_left_alone(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = target_space(session, bundle)
    session.add(Garden(space_id=context.space_id, name="Existing", updated_at=MOMENT))
    session.flush()

    result = import_bytes(session, context, bundle["data"])

    assert result.summary["garden"] == garden_rules.SKIPPED_NOT_EMPTY
    imported = _rows(session, context.space_id)
    assert [garden.name for garden in imported["gardens"]] == ["Existing"]
    assert _row_count(session, context.space_id) == 1, "no plant, bouquet or name was added"


def test_with_only_one_person_in_the_target_the_import_refuses_and_writes_nothing(  # type: ignore[no-untyped-def]
    session: Session, bundle
) -> None:
    lonely = make_account(session, "Cara")
    space = make_space(session, lonely)
    session.flush()
    context = AuthorizationContext(account_id=lonely.id, space_id=space.id)

    with pytest.raises(TransferArchiveError) as refused:
        import_bytes(session, context, bundle["data"])

    assert refused.value.code == "TRANSFER_MEMBER_MAPPING_REQUIRED"
    assert _row_count(session, space.id) == 0


def test_a_garden_needs_both_persons_mapped(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = target_space(session, bundle)
    anna, ben = bundle["anna"].id, bundle["ben"].id
    assert garden_rules.skip_reason(session, context.space_id, {anna: anna, ben: ben}) is None
    # One mapped person is not a pair, whatever else is true.
    assert (
        garden_rules.skip_reason(session, context.space_id, {anna: anna})
        == garden_rules.SKIPPED_NOT_BOTH_PERSONS
    )
    assert (
        garden_rules.skip_reason(session, context.space_id, {anna: anna, ben: anna})
        == garden_rules.SKIPPED_NOT_BOTH_PERSONS
    )


HOSTILE: dict[str, Callable[[dict[str, list[dict[str, Any]]]], None]] = {
    "unknown species": lambda t: t["garden_plants"][0].update(species="ROSE"),
    "a surprise is never stored": lambda t: t["garden_plants"][0].update(species="SURPRISE"),
    "words outside the closed set": lambda t: t["garden_plants"][0].update(words="HELLO"),
    "stage above the maximum": lambda t: t["garden_plants"][0].update(stage=4),
    "negative stage": lambda t: t["garden_plants"][0].update(stage=-1),
    "stage is not a number": lambda t: t["garden_plants"][0].update(stage="2"),
    "negative slot": lambda t: t["garden_plants"][0].update(slot=-1),
    "slot beyond a small integer": lambda t: t["garden_plants"][0].update(slot=40000),
    "slot is a boolean": lambda t: t["garden_plants"][0].update(slot=True),
    "a plant without a slot": lambda t: t["garden_plants"][0].update(slot=None),
    "a seed that already grew": lambda t: next(
        row for row in t["garden_plants"] if row["species"] == "POPPY"
    ).update(stage=1),
    "a lily outside the pond": lambda t: next(
        row for row in t["garden_plants"] if row["species"] == "WATER_LILY"
    ).update(inPond=False),
    "a tulip in the pond": lambda t: t["garden_plants"][0].update(inPond=True),
    "bloom day without a bloom": lambda t: t["garden_plants"][0].update(bloomed=False),
    "sender is the receiver": lambda t: t["garden_plants"][0].update(
        receiverId=t["garden_plants"][0]["senderId"]
    ),
    "a stranger sends a seed": lambda t: t["garden_plants"][0].update(senderId=str(uuid4())),
    "a seed without a receiver": lambda t: t["garden_plants"][0].update(receiverId=None),
    "the date is not a date": lambda t: t["garden_plants"][0].update(sentOn="yesterday"),
    "two seeds from one person on one day": lambda t: t["garden_plants"].append(
        {**t["garden_plants"][0], "id": str(uuid4()), "slot": 9}
    ),
    "two plants in one bed slot": lambda t: t["garden_plants"].append(
        {**t["garden_plants"][0], "id": str(uuid4()), "sentOn": "2026-12-01"}
    ),
    "a watering of an unknown plant": lambda t: t["garden_waterings"][0].update(
        plantId=str(uuid4())
    ),
    "a second watering on one day": lambda t: t["garden_waterings"].append(
        {**t["garden_waterings"][0], "id": str(uuid4())}
    ),
    "a reader who sees negative days": lambda t: t["garden_readers"][0].update(seenSharedDays=-1),
    "a visitor that does not exist": lambda t: t["garden_visitor_names"][0].update(animal="DRAGON"),
    "a blank visitor name": lambda t: t["garden_visitor_names"][0].update(name="   "),
    "a garden name over the limit": lambda t: t["gardens"][0].update(name="x" * 41),
    "two gardens": lambda t: t["gardens"].append({**t["gardens"][0]}),
    "four flowers": lambda t: t["garden_bouquets"][0].update(
        flowers=["TULIP"] * 4, flowerSenders=[t["garden_bouquets"][0]["giverId"]] * 4
    ),
    "no flowers": lambda t: t["garden_bouquets"][0].update(flowers=[], flowerSenders=[]),
    "a flower of an unknown species": lambda t: t["garden_bouquets"][0].update(
        flowers=["TULIP", "ROSE"]
    ),
    "flower senders of another length": lambda t: t["garden_bouquets"][0].update(
        flowerSenders=[t["garden_bouquets"][0]["giverId"]]
    ),
    "flowers that are not a list": lambda t: t["garden_bouquets"][0].update(flowers="TULIP"),
    "a flower sender that is not an identifier": lambda t: t["garden_bouquets"][0].update(
        flowerSenders=["not-an-id", "not-an-id"]
    ),
    "a flower sender who is not a member": lambda t: t["garden_bouquets"][0].update(
        flowerSenders=[str(uuid4()), str(uuid4())]
    ),
    "flower senders that are not a list": lambda t: t["garden_bouquets"][0].update(
        flowerSenders="x"
    ),
    "a kept bouquet that never closed": lambda t: t["garden_bouquets"][0].update(closedAt=None),
    "a bouquet given to the giver": lambda t: t["garden_bouquets"][0].update(
        receiverId=t["garden_bouquets"][0]["giverId"]
    ),
    "an unknown column": lambda t: t["garden_plants"][0].update(distanceKm=12),
}


def test_a_resealed_but_unchanged_garden_still_imports(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    """Control for the hostile cases below: re-sealing a file is not what makes it fail."""
    context = target_space(session, bundle)

    result = import_bytes(session, context, _forged(bundle["data"], lambda tables: None))

    assert result.summary["garden"] == garden_rules.INCLUDED
    assert _row_count(session, context.space_id) == 10


@pytest.mark.parametrize("edit", HOSTILE.values(), ids=HOSTILE.keys())
def test_a_hostile_garden_is_refused_before_anything_is_written(  # type: ignore[no-untyped-def]
    session: Session, bundle, edit
) -> None:
    context = target_space(session, bundle)
    hostile = _forged(bundle["data"], edit)

    with pytest.raises(TransferArchiveError):
        validate_bytes(session, context, hostile)
    with pytest.raises(TransferArchiveError):
        import_bytes(session, context, hostile)

    assert _row_count(session, context.space_id) == 0


def test_rows_of_another_space_in_the_bundle_are_refused(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = target_space(session, bundle)
    foreign_space = str(uuid4())

    def move(tables: dict[str, list[dict[str, Any]]]) -> None:
        for rows in tables.values():
            for row in rows:
                row["spaceId"] = foreign_space

    with pytest.raises(TransferArchiveError):
        import_bytes(session, context, _forged(bundle["data"], move))
    assert _row_count(session, context.space_id) == 0


def test_a_garden_table_that_is_not_in_the_allowlist_is_refused(session: Session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = target_space(session, bundle)

    def add_table(entries: dict[str, bytes]) -> None:
        document = json.loads(entries["garden.json"])
        document["tables"].append({"name": "couple_games", "rows": []})
        entries["garden.json"] = json.dumps(document).encode()

    with pytest.raises(TransferArchiveError):
        import_bytes(session, context, forge(bundle["data"], add_table))


def test_a_personal_export_carries_the_same_garden_as_a_shared_one(  # type: ignore[no-untyped-def]
    session: Session, bundle, tmp_path: Path
) -> None:
    personal = export_bytes(session, bundle["context"], tmp_path, TransferScope.PERSONAL)
    shared = _garden_document(bundle["data"])
    assert {
        name: sorted(row["id"] if "id" in row else json.dumps(row, sort_keys=True) for row in rows)
        for name, rows in _garden_document(personal).items()
    } == {
        name: sorted(row["id"] if "id" in row else json.dumps(row, sort_keys=True) for row in rows)
        for name, rows in shared.items()
    }


def test_a_garden_that_refers_to_a_former_member_is_left_out_of_the_export(  # type: ignore[no-untyped-def]
    session: Session, tmp_path: Path
) -> None:
    pair = couple(session)
    session.add(_plant(pair["space"].id, pair["anna"].id, uuid4()))
    session.flush()

    data = export_bytes(session, pair["context"], tmp_path)

    with ZipFile(io.BytesIO(data)) as archive:
        assert "garden.json" not in archive.namelist()


def test_without_garden_tables_the_export_and_import_skip_the_garden(  # type: ignore[no-untyped-def]
    session: Session, bundle, tmp_path: Path, monkeypatch
) -> None:
    context = target_space(session, bundle)
    monkeypatch.setattr(garden_rules, "available", lambda session: False)

    without = export_bytes(session, bundle["context"], tmp_path)
    with ZipFile(io.BytesIO(without)) as archive:
        assert "garden.json" not in archive.namelist()

    result = import_bytes(session, context, bundle["data"])
    assert result.summary["garden"] == garden_rules.SKIPPED_NOT_AVAILABLE
    monkeypatch.undo()
    assert _row_count(session, context.space_id) == 0


def test_a_partner_joining_or_leaving_removes_the_imported_garden(  # type: ignore[no-untyped-def]
    session: Session, bundle
) -> None:
    """Why the operator connects both persons first and imports afterwards."""
    context = target_space(session, bundle)
    import_bytes(session, context, bundle["data"])
    assert _row_count(session, context.space_id) == 10

    membership = session.scalars(
        select(Membership).where(
            Membership.space_id == context.space_id, Membership.account_id == bundle["ben"].id
        )
    ).one()
    relationship_service.end_membership(session, membership)

    assert _row_count(session, context.space_id) == 0
    assert session.scalar(select(func.count()).select_from(GardenPlant)) >= 3, (
        "the source garden is a different Space and stays"
    )
