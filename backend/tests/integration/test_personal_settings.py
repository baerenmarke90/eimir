"""Personal settings follow the Account: own-only, closed schema, versioned, exportable."""

import json
from uuid import uuid4
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.personal_settings.models import PersonalSettings
from eimir.relationship import offboarding
from eimir.relationship.service import add_member
from eimir.transfer.models import TransferScope
from eimir.transfer.service import build_export_archive
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ACCOUNT_PATH = "/api/v1/account/personal-settings"
EMPTY_ACCOUNT = {
    "theme": None,
    "diaryLayout": None,
    "gardenSound": None,
    "gardenVibration": None,
    "schemaVersion": 1,
    "version": 0,
}
EMPTY_SPACE = {
    "occasionHolidays": None,
    "wirStatistics": None,
    "schemaVersion": 1,
    "version": 0,
}


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


def space_path(space_id) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{space_id}/personal-settings"


def patch(client, path: str, headers, body):  # type: ignore[no-untyped-def]
    current = client.get(path, headers=headers)
    return client.patch(path, headers={**headers, "If-Match": current.headers["ETag"]}, json=body)


def rows(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(PersonalSettings)) or 0


def test_reads_default_to_no_saved_choice_and_never_create_a_row(client, session, couple) -> None:
    account = client.get(ACCOUNT_PATH, headers=couple["a"])
    space = client.get(space_path(couple["space"].id), headers=couple["a"])
    assert account.status_code == space.status_code == 200
    assert account.json() == EMPTY_ACCOUNT
    assert space.json() == EMPTY_SPACE
    for response in (account, space):
        assert response.headers["Cache-Control"] == "private, no-store"
        assert response.headers["ETag"]
    assert rows(session) == 0


def test_account_changes_merge_per_key_and_null_removes_a_choice(client, session, couple) -> None:
    saved = patch(client, ACCOUNT_PATH, couple["a"], {"theme": "dark"})
    assert saved.status_code == 200
    assert saved.json() == {**EMPTY_ACCOUNT, "theme": "dark", "version": 1}
    merged = client.patch(
        ACCOUNT_PATH,
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"diaryLayout": "compact", "gardenSound": True, "gardenVibration": False},
    )
    assert merged.json() == {
        "theme": "dark",
        "diaryLayout": "compact",
        "gardenSound": True,
        "gardenVibration": False,
        "schemaVersion": 1,
        "version": 2,
    }
    cleared = client.patch(
        ACCOUNT_PATH,
        headers={**couple["a"], "If-Match": merged.headers["ETag"]},
        json={"theme": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["theme"] is None
    assert cleared.json()["diaryLayout"] == "compact"
    assert client.get(ACCOUNT_PATH, headers=couple["a"]).json() == cleared.json()
    stored = session.scalars(select(PersonalSettings.settings)).one()
    assert stored == {"diary_layout": "compact", "garden_sound": True, "garden_vibration": False}


def test_choices_are_personal_and_scoped_to_account_or_space(client, session, couple) -> None:
    patch(client, ACCOUNT_PATH, couple["a"], {"theme": "light"})
    patch(client, space_path(couple["space"].id), couple["a"], {"occasionHolidays": True})
    other_space = make_space(session, couple["anna"])

    assert client.get(ACCOUNT_PATH, headers=couple["b"]).json() == EMPTY_ACCOUNT
    assert client.get(space_path(couple["space"].id), headers=couple["b"]).json() == EMPTY_SPACE
    assert client.get(space_path(other_space.id), headers=couple["a"]).json() == EMPTY_SPACE
    # The Account-wide document is the same wherever Anna signs in.
    assert client.get(ACCOUNT_PATH, headers=auth(sign_in(session, couple["anna"]))).json()[
        "theme"
    ] == ("light")
    own = client.get(space_path(couple["space"].id), headers=couple["a"]).json()
    assert own["occasionHolidays"] is True
    assert own["wirStatistics"] is None


def test_authentication_membership_and_closed_schema(client, session, couple) -> None:
    space = space_path(couple["space"].id)
    assert client.get(ACCOUNT_PATH).status_code == 401
    assert client.get(space).status_code == 401
    assert client.patch(ACCOUNT_PATH, json={"theme": "dark"}).status_code == 401
    current = client.get(space, headers=couple["a"])
    token = {"If-Match": current.headers["ETag"]}
    assert client.get(space, headers=couple["out"]).status_code == 404
    assert (
        client.patch(
            space, headers={**couple["out"], **token}, json={"occasionHolidays": True}
        ).status_code
        == 404
    )
    assert client.get(space_path(uuid4()), headers=couple["a"]).status_code == 404

    account_token = {"If-Match": client.get(ACCOUNT_PATH, headers=couple["a"]).headers["ETag"]}
    for body in (
        {},
        {"pushToken": "device"},
        {"theme": "sepia"},
        {"diaryLayout": "grid"},
        {"gardenSound": "yes"},
        {"gardenSound": 1},
        {"occasionHolidays": True},
    ):
        response = client.patch(ACCOUNT_PATH, headers={**couple["a"], **account_token}, json=body)
        assert response.status_code == 422, body
    for body in ({}, {"theme": "dark"}, {"wirStatistics": "true"}, {"partnerId": str(uuid4())}):
        response = client.patch(space, headers={**couple["a"], **token}, json=body)
        assert response.status_code == 422, body
    assert client.patch(ACCOUNT_PATH, headers=couple["a"], json={"theme": "dark"}).status_code == (
        422
    )
    assert rows(session) == 0


def test_a_stale_version_conflicts_instead_of_overwriting(client, session, couple) -> None:
    first_read = client.get(ACCOUNT_PATH, headers=couple["a"])
    stale = {**couple["a"], "If-Match": first_read.headers["ETag"]}
    assert client.patch(ACCOUNT_PATH, headers=stale, json={"theme": "dark"}).status_code == 200
    conflict = client.patch(ACCOUNT_PATH, headers=stale, json={"theme": "light"})
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "RESOURCE_VERSION_CONFLICT"
    assert client.get(ACCOUNT_PATH, headers=couple["a"]).json()["theme"] == "dark"

    space = space_path(couple["space"].id)
    space_read = client.get(space, headers=couple["a"])
    space_stale = {**couple["a"], "If-Match": space_read.headers["ETag"]}
    assert client.patch(space, headers=space_stale, json={"wirStatistics": True}).status_code == 200
    assert client.patch(space, headers=space_stale, json={"wirStatistics": False}).status_code == (
        409
    )
    # Another document's token never authorizes a write to this one.
    assert client.patch(space, headers=stale, json={"wirStatistics": False}).status_code == 409


def test_personal_export_carries_the_settings_and_lifecycle_removes_them(
    client, session, couple
) -> None:
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)

    def exported(scope: TransferScope):  # type: ignore[no-untyped-def]
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            return json.loads(archive.read("accounts.json")).get("personalSettings")

    assert exported(TransferScope.PERSONAL) == {"schemaVersion": 1, "account": {}, "space": {}}
    patch(client, ACCOUNT_PATH, couple["a"], {"theme": "dark", "gardenSound": True})
    patch(client, space_path(couple["space"].id), couple["a"], {"wirStatistics": True})
    patch(client, ACCOUNT_PATH, couple["b"], {"theme": "light"})
    session.expire_all()
    assert exported(TransferScope.PERSONAL) == {
        "schemaVersion": 1,
        "account": {"theme": "dark", "gardenSound": True},
        "space": {"wirStatistics": True},
    }
    assert exported(TransferScope.SHARED) is None

    offboarding.leave_space(session, couple["anna"], couple["space"].id)
    session.expire_all()
    remaining = session.scalars(
        select(PersonalSettings).where(PersonalSettings.account_id == couple["anna"].id)
    ).all()
    assert [row.space_id for row in remaining] == [None]

    apply_accepted_tombstone(session, couple["anna"].id, accepted_at=now())
    apply_core_cleanup(session, couple["anna"].id)
    session.expire_all()
    assert session.scalars(select(PersonalSettings.account_id)).all() == [couple["ben"].id]
