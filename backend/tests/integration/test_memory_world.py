"""Personal memory world (#2283): own-only, Story by default, Pro for alternative worlds."""

import json
from typing import Any
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.appearance.models import (
    DEFAULT_MEMORY_WORLD,
    FREE_MEMORY_WORLDS,
    AppIconPreference,
    MemoryWorldId,
)
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.relationship.service import add_member
from eimir.transfer.models import TransferScope
from eimir.transfer.service import build_export_archive
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import requires_pro

pytestmark = [pytest.mark.integration, requires_database]

PRO_WORLDS = [world for world in MemoryWorldId if world not in FREE_MEMORY_WORLDS]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    other = make_space(session, anna)
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "other": other,
        "a": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
        "out": auth(sign_in(session, outsider)),
    }


def grant(session: Session, couple):  # type: ignore[no-untyped-def]
    return entitlements.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        effective_from=now(),
        capabilities=[Capability.THEME_BESPOKE_PACKS.value],
    )


def path(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/appearance/memory-world"


def test_story_is_the_default_and_story_and_stack_are_free() -> None:
    assert DEFAULT_MEMORY_WORLD is MemoryWorldId.STORY
    assert {world.value for world in FREE_MEMORY_WORLDS} == {"story", "stack"}
    assert {world.value for world in PRO_WORLDS} == {
        "crate",
        "cloud",
        "booth",
        "fridge",
        "album",
        "scratch",
        "mochi",
        "stars",
        "post",
        "jar",
    }


def test_read_defaults_to_story_and_never_creates_a_row(client, session, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    assert initial.status_code == 200
    assert initial.json() == {"worldId": "story", "version": 0}
    assert initial.headers["Cache-Control"] == "private, no-store"
    assert initial.headers["ETag"]
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0


def test_free_worlds_are_saved_without_pro_and_stored_explicitly(client, session, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    stack = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"worldId": "stack"},
    )
    assert stack.status_code == 200
    assert stack.json() == {"worldId": "stack", "version": 1}
    assert stack.headers["ETag"] != initial.headers["ETag"]
    assert stack.headers["Cache-Control"] == "private, no-store"
    story = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": stack.headers["ETag"]},
        json={"worldId": "story"},
    )
    assert story.status_code == 200
    assert story.json() == {"worldId": "story", "version": 2}
    assert session.scalars(select(AppIconPreference.memory_world)).all() == ["story"]


@requires_pro
@pytest.mark.parametrize("world_id", PRO_WORLDS)
def test_every_alternative_world_is_pro_for_both_partners(
    client, session, couple, world_id
) -> None:
    initial = client.get(path(couple), headers=couple["b"])
    headers = {**couple["b"], "If-Match": initial.headers["ETag"]}
    blocked = client.patch(path(couple), headers=headers, json={"worldId": world_id.value})
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0
    grant(session, couple)
    saved = client.patch(path(couple), headers=headers, json={"worldId": world_id.value})
    assert saved.status_code == 200
    assert saved.json() == {"worldId": world_id.value, "version": 1}
    # The partner's choice is never visible or affected.
    assert client.get(path(couple), headers=couple["a"]).json() == {
        "worldId": "story",
        "version": 0,
    }


@requires_pro
def test_downgrade_retains_the_world_blocks_a_new_pro_choice_and_free_returns_work(
    client, session, couple
) -> None:
    entitlement = grant(session, couple)
    initial = client.get(path(couple), headers=couple["a"])
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"worldId": "crate"},
    )
    assert saved.status_code == 200
    entitlements.revoke_grant(session, entitlement.id)
    retained = client.get(path(couple), headers=couple["a"])
    assert retained.status_code == 200
    assert retained.json()["worldId"] == "crate"
    assert retained.headers["ETag"] == saved.headers["ETag"]
    blocked = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"worldId": "crate"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    stack = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"worldId": "stack"},
    )
    assert stack.status_code == 200
    assert stack.json()["worldId"] == "stack"
    story = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": stack.headers["ETag"]},
        json={"worldId": "story"},
    )
    assert story.status_code == 200
    assert story.json()["worldId"] == "story"


@requires_pro
def test_membership_owner_scope_invalid_ids_and_required_concurrency(
    client, session, couple
) -> None:
    grant(session, couple)
    initial = client.get(path(couple), headers=couple["a"])
    token = {"If-Match": initial.headers["ETag"]}
    assert client.get(path(couple), headers=couple["out"]).status_code == 404
    assert client.get(path(couple)).status_code == 401
    assert (
        client.patch(
            path(couple), headers={**couple["out"], **token}, json={"worldId": "crate"}
        ).status_code
        == 404
    )
    # The token is bound to the owner and the Space; it is not valid for anybody else.
    assert (
        client.patch(
            path(couple), headers={**couple["b"], **token}, json={"worldId": "story"}
        ).status_code
        == 409
    )
    other_path = f"/api/v1/spaces/{couple['other'].id}/appearance/memory-world"
    assert (
        client.patch(
            other_path, headers={**couple["a"], **token}, json={"worldId": "story"}
        ).status_code
        == 409
    )
    for body in (
        {"worldId": "unknown"},
        {"worldId": "Story"},
        {"worldId": None},
        {"worldId": "https://example.test/world"},
        {},
    ):
        assert (
            client.patch(path(couple), headers={**couple["a"], **token}, json=body).status_code
            == 422
        )
    assert (
        client.patch(path(couple), headers=couple["a"], json={"worldId": "stack"}).status_code
        == 422
    )
    for invalid in ("*", 'W/"0"', '"one", "two"'):
        assert (
            client.patch(
                path(couple),
                headers={**couple["a"], "If-Match": invalid},
                json={"worldId": "stack"},
            ).status_code
            == 422
        )
    first = client.patch(path(couple), headers={**couple["a"], **token}, json={"worldId": "crate"})
    assert first.status_code == 200
    stale = client.patch(path(couple), headers={**couple["a"], **token}, json={"worldId": "stack"})
    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"
    assert client.get(path(couple), headers=couple["a"]).json()["worldId"] == "crate"
    assert client.get(other_path, headers=couple["a"]).json()["worldId"] == "story"


@requires_pro
def test_world_shares_the_appearance_token_without_overwriting_other_choices(
    client, session, couple
) -> None:
    grant(session, couple)
    world_path = path(couple)
    icon_path = world_path.replace("memory-world", "app-icon")
    colours_path = world_path.replace("memory-world", "person-colours")
    initial = client.get(world_path, headers=couple["a"])
    icon = client.patch(
        icon_path,
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"iconId": "sage"},
    )
    assert icon.status_code == 200
    stale = client.patch(
        world_path,
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"worldId": "crate"},
    )
    assert stale.status_code == 409
    world = client.patch(
        world_path,
        headers={**couple["a"], "If-Match": icon.headers["ETag"]},
        json={"worldId": "crate"},
    )
    assert world.status_code == 200
    assert world.json() == {"worldId": "crate", "version": 2}
    assert client.get(icon_path, headers=couple["a"]).json()["iconId"] == "sage"
    colours = client.patch(
        colours_path,
        headers={**couple["a"], "If-Match": world.headers["ETag"]},
        json={"colours": "rose_blue"},
    )
    assert colours.status_code == 200
    assert client.get(world_path, headers=couple["a"]).json() == {
        "worldId": "crate",
        "version": 3,
    }


def test_a_world_unknown_to_this_installation_resolves_to_story_and_can_be_replaced(
    client, session, couple
) -> None:
    session.add(
        AppIconPreference(
            icon_id="original",
            account_id=couple["anna"].id,
            space_id=couple["space"].id,
            memory_world="retired_world",
        )
    )
    session.flush()
    current = client.get(path(couple), headers=couple["a"])
    assert current.status_code == 200
    assert current.json() == {"worldId": "story", "version": 1}
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": current.headers["ETag"]},
        json={"worldId": "stack"},
    )
    assert saved.status_code == 200
    assert saved.json() == {"worldId": "stack", "version": 2}
    assert session.scalars(select(AppIconPreference.memory_world)).all() == ["stack"]


def test_personal_export_includes_only_the_callers_world_and_deletion_purges_it(
    session, couple
) -> None:
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)

    def account_document(scope: TransferScope) -> dict[str, Any]:
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            document: dict[str, Any] = json.loads(archive.read("accounts.json"))
        return document

    # Without a stored choice the export carries no world, like the other optional choices.
    assert "memoryWorld" not in account_document(TransferScope.PERSONAL)["personalAppearance"]
    own = AppIconPreference(
        account_id=couple["anna"].id,
        space_id=couple["space"].id,
        icon_id="original",
        memory_world="crate",
    )
    partner = AppIconPreference(
        account_id=couple["ben"].id,
        space_id=couple["space"].id,
        icon_id="original",
        memory_world="stack",
    )
    session.add_all([own, partner])
    session.flush()
    assert account_document(TransferScope.PERSONAL)["personalAppearance"] == {
        "appIconId": "original",
        "wirDesign": "connected",
        "memoryWorld": "crate",
    }
    assert "personalAppearance" not in account_document(TransferScope.SHARED)
    apply_accepted_tombstone(session, couple["anna"].id, accepted_at=now())
    apply_core_cleanup(session, couple["anna"].id)
    session.expire_all()
    assert session.get(AppIconPreference, own.id) is None
    assert session.get(AppIconPreference, partner.id) is not None
