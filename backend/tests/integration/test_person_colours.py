"""Personal person-colour pair: own-only, optional, free, concurrent-safe and exportable."""

import json
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.appearance.models import AppIconPreference, PersonColoursId
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.relationship.service import add_member
from eimir.transfer.models import TransferScope
from eimir.transfer.service import build_export_archive
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "a": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
        "out": auth(sign_in(session, outsider)),
    }


def path(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/appearance/person-colours"


def test_the_pairs_are_exactly_the_agreed_combinations() -> None:
    assert {pair.value for pair in PersonColoursId} == {
        "rose_blue",
        "blue_rose",
        "rose_deeprose",
        "deeprose_rose",
        "blue_deepblue",
        "deepblue_blue",
        "moss_rose",
        "moss_blue",
    }


def test_read_defaults_to_automatic_and_never_creates_a_row(client, session, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    assert initial.status_code == 200
    assert initial.json() == {"colours": None, "version": 0}
    assert initial.headers["Cache-Control"] == "private, no-store"
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0


def test_a_pair_is_saved_free_changed_and_cleared_back_to_automatic(
    client, session, couple
) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"colours": "blue_deepblue"},
    )
    assert saved.status_code == 200
    assert saved.json() == {"colours": "blue_deepblue", "version": 1}
    changed = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"colours": "rose_deeprose"},
    )
    assert changed.json() == {"colours": "rose_deeprose", "version": 2}
    cleared = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": changed.headers["ETag"]},
        json={"colours": None},
    )
    assert cleared.status_code == 200
    assert cleared.json() == {"colours": None, "version": 3}
    assert session.scalars(select(AppIconPreference.person_colours)).all() == [None]


def test_the_choice_is_personal_and_never_visible_to_the_partner(client, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"colours": "moss_rose"},
    )
    assert client.get(path(couple), headers=couple["a"]).json()["colours"] == "moss_rose"
    assert client.get(path(couple), headers=couple["b"]).json() == {
        "colours": None,
        "version": 0,
    }


def test_membership_authentication_validation_and_concurrency(client, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    token = {"If-Match": initial.headers["ETag"]}
    assert client.get(path(couple), headers=couple["out"]).status_code == 404
    assert client.get(path(couple)).status_code == 401
    assert (
        client.patch(
            path(couple), headers={**couple["out"], **token}, json={"colours": "rose_blue"}
        ).status_code
        == 404
    )
    for body in ({"colours": "pink_green"}, {}):
        assert (
            client.patch(path(couple), headers={**couple["a"], **token}, json=body).status_code
            == 422
        )
    assert (
        client.patch(path(couple), headers=couple["a"], json={"colours": "rose_blue"}).status_code
        == 422
    )
    first = client.patch(
        path(couple), headers={**couple["a"], **token}, json={"colours": "rose_blue"}
    )
    assert first.status_code == 200
    stale = client.patch(
        path(couple), headers={**couple["a"], **token}, json={"colours": "blue_rose"}
    )
    assert stale.status_code == 409


def test_personal_export_contains_the_pair_only_when_chosen_and_deletion_removes_it(
    client, session, couple
) -> None:
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)

    def appearance(scope: TransferScope) -> dict[str, str] | None:
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            document = json.loads(archive.read("accounts.json"))
        return document.get("personalAppearance")

    assert "personColours" not in (appearance(TransferScope.PERSONAL) or {})
    initial = client.get(path(couple), headers=couple["a"])
    client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"colours": "deepblue_blue"},
    )
    session.expire_all()
    personal = appearance(TransferScope.PERSONAL)
    assert personal is not None
    assert personal["personColours"] == "deepblue_blue"
    assert appearance(TransferScope.SHARED) is None
    apply_accepted_tombstone(session, couple["anna"].id, accepted_at=now())
    apply_core_cleanup(session, couple["anna"].id)
    session.expire_all()
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0
