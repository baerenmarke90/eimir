"""Personal Wir reel style (#2345): own-only, circles by default, Pro for tiles and chips."""

import json
from typing import Any
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.appearance.models import (
    DEFAULT_WIR_REEL_STYLE,
    FREE_WIR_REEL_STYLES,
    AppIconPreference,
    WirReelStyleId,
)
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.relationship.service import add_member
from eimir.transfer.models import TransferScope
from eimir.transfer.service import build_export_archive
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import requires_pro

pytestmark = [pytest.mark.integration, requires_database]

PRO_STYLES = [style for style in WirReelStyleId if style not in FREE_WIR_REEL_STYLES]


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
    return f"/api/v1/spaces/{couple['space'].id}/appearance/wir-reels"


def test_circles_is_the_default_and_the_only_free_style() -> None:
    assert DEFAULT_WIR_REEL_STYLE is WirReelStyleId.CIRCLES
    assert {style.value for style in FREE_WIR_REEL_STYLES} == {"circles"}
    assert {style.value for style in PRO_STYLES} == {"tiles", "chips"}


def test_read_defaults_to_circles_and_never_creates_a_row(client, session, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    assert initial.status_code == 200
    assert initial.json() == {"styleId": "circles", "version": 0}
    assert initial.headers["Cache-Control"] == "private, no-store"
    assert initial.headers["ETag"]
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0


def test_circles_are_saved_without_pro_and_stored_explicitly(client, session, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"styleId": "circles"},
    )
    assert saved.status_code == 200
    assert saved.json() == {"styleId": "circles", "version": 1}
    assert saved.headers["ETag"] != initial.headers["ETag"]
    assert saved.headers["Cache-Control"] == "private, no-store"
    assert session.scalars(select(AppIconPreference.wir_reel_style)).all() == ["circles"]


@requires_pro
@pytest.mark.parametrize("style_id", PRO_STYLES)
def test_tiles_and_chips_require_pro_for_both_partners(client, session, couple, style_id) -> None:
    initial = client.get(path(couple), headers=couple["b"])
    headers = {**couple["b"], "If-Match": initial.headers["ETag"]}
    blocked = client.patch(path(couple), headers=headers, json={"styleId": style_id.value})
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0
    grant(session, couple)
    saved = client.patch(path(couple), headers=headers, json={"styleId": style_id.value})
    assert saved.status_code == 200
    assert saved.json() == {"styleId": style_id.value, "version": 1}
    # The partner's choice is never visible or affected.
    assert client.get(path(couple), headers=couple["a"]).json() == {
        "styleId": "circles",
        "version": 0,
    }


@requires_pro
def test_downgrade_keeps_the_style_blocks_a_new_pro_choice_and_circles_stay_free(
    client, session, couple
) -> None:
    entitlement = grant(session, couple)
    initial = client.get(path(couple), headers=couple["a"])
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"styleId": "tiles"},
    )
    assert saved.status_code == 200
    entitlements.revoke_grant(session, entitlement.id)
    retained = client.get(path(couple), headers=couple["a"])
    assert retained.status_code == 200
    assert retained.json()["styleId"] == "tiles"
    assert retained.headers["ETag"] == saved.headers["ETag"]
    blocked = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"styleId": "chips"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    circles = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"styleId": "circles"},
    )
    assert circles.status_code == 200
    assert circles.json()["styleId"] == "circles"


@requires_pro
def test_membership_scope_invalid_ids_and_required_concurrency(client, session, couple) -> None:
    grant(session, couple)
    initial = client.get(path(couple), headers=couple["a"])
    token = {"If-Match": initial.headers["ETag"]}
    assert client.get(path(couple), headers=couple["out"]).status_code == 404
    assert client.get(path(couple)).status_code == 401
    assert (
        client.patch(
            path(couple), headers={**couple["out"], **token}, json={"styleId": "tiles"}
        ).status_code
        == 404
    )
    # The token is bound to the owner and the Space; it is not valid for anybody else.
    assert (
        client.patch(
            path(couple), headers={**couple["b"], **token}, json={"styleId": "circles"}
        ).status_code
        == 409
    )
    other_path = f"/api/v1/spaces/{couple['other'].id}/appearance/wir-reels"
    assert (
        client.patch(
            other_path, headers={**couple["a"], **token}, json={"styleId": "circles"}
        ).status_code
        == 409
    )
    for body in ({"styleId": "unknown"}, {"styleId": "Tiles"}, {"styleId": None}, {}):
        assert (
            client.patch(path(couple), headers={**couple["a"], **token}, json=body).status_code
            == 422
        )
    assert (
        client.patch(path(couple), headers=couple["a"], json={"styleId": "chips"}).status_code
        == 422
    )
    first = client.patch(path(couple), headers={**couple["a"], **token}, json={"styleId": "tiles"})
    assert first.status_code == 200
    stale = client.patch(path(couple), headers={**couple["a"], **token}, json={"styleId": "chips"})
    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"
    assert client.get(path(couple), headers=couple["a"]).json()["styleId"] == "tiles"
    assert client.get(other_path, headers=couple["a"]).json()["styleId"] == "circles"


@requires_pro
def test_style_shares_the_appearance_token_without_overwriting_other_choices(
    client, session, couple
) -> None:
    grant(session, couple)
    style_path = path(couple)
    world_path = style_path.replace("wir-reels", "memory-world")
    initial = client.get(style_path, headers=couple["a"])
    world = client.patch(
        world_path,
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"worldId": "crate"},
    )
    assert world.status_code == 200
    stale = client.patch(
        style_path,
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"styleId": "chips"},
    )
    assert stale.status_code == 409
    style = client.patch(
        style_path,
        headers={**couple["a"], "If-Match": world.headers["ETag"]},
        json={"styleId": "chips"},
    )
    assert style.status_code == 200
    assert style.json() == {"styleId": "chips", "version": 2}
    assert client.get(world_path, headers=couple["a"]).json()["worldId"] == "crate"


def test_a_style_unknown_to_this_installation_resolves_to_circles(client, session, couple) -> None:
    session.add(
        AppIconPreference(
            icon_id="original",
            account_id=couple["anna"].id,
            space_id=couple["space"].id,
            wir_reel_style="stripes",
        )
    )
    session.flush()
    current = client.get(path(couple), headers=couple["a"])
    assert current.status_code == 200
    assert current.json() == {"styleId": "circles", "version": 1}


def test_personal_export_includes_only_the_callers_style(session, couple) -> None:
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)

    def account_document(scope: TransferScope) -> dict[str, Any]:
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            document: dict[str, Any] = json.loads(archive.read("accounts.json"))
        return document

    # Without a stored choice the export carries no style, like the other optional choices.
    assert "wirReelStyle" not in account_document(TransferScope.PERSONAL)["personalAppearance"]
    own = AppIconPreference(
        account_id=couple["anna"].id,
        space_id=couple["space"].id,
        icon_id="original",
        wir_reel_style="tiles",
    )
    partner = AppIconPreference(
        account_id=couple["ben"].id,
        space_id=couple["space"].id,
        icon_id="original",
        wir_reel_style="chips",
    )
    session.add_all([own, partner])
    session.flush()
    assert account_document(TransferScope.PERSONAL)["personalAppearance"] == {
        "appIconId": "original",
        "wirDesign": "connected",
        "wirReelStyle": "tiles",
    }
    assert "personalAppearance" not in account_document(TransferScope.SHARED)
