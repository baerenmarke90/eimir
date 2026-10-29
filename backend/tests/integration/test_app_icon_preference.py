"""Personal icon ownership, Pro boundary, concurrency and data lifecycle."""

import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.appearance.models import AppIconId, AppIconPreference
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
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
    other = make_space(session, anna)
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
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
    return f"/api/v1/spaces/{couple['space'].id}/appearance/app-icon"


def test_original_and_reads_are_free_and_never_create_rows(client, session, couple) -> None:
    initial = client.get(path(couple), headers=couple["a"])
    assert initial.status_code == 200
    assert initial.json()["iconId"] == "original"
    assert initial.json()["version"] == 0
    assert initial.headers["Cache-Control"] == "private, no-store"
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"iconId": "original"},
    )
    assert saved.status_code == 200
    assert saved.json()["version"] == 1
    assert saved.headers["ETag"] != initial.headers["ETag"]


@pytest.mark.parametrize("icon_id", [icon for icon in AppIconId if icon != AppIconId.ORIGINAL])
def test_every_alternative_is_pro_for_both_partners(client, session, couple, icon_id) -> None:
    initial = client.get(path(couple), headers=couple["b"])
    headers = {**couple["b"], "If-Match": initial.headers["ETag"]}
    blocked = client.patch(path(couple), headers=headers, json={"iconId": icon_id.value})
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert session.scalar(select(func.count()).select_from(AppIconPreference)) == 0
    grant(session, couple)
    saved = client.patch(path(couple), headers=headers, json={"iconId": icon_id.value})
    assert saved.status_code == 200
    assert saved.json()["iconId"] == icon_id.value
    assert client.get(path(couple), headers=couple["a"]).json()["iconId"] == "original"


def test_downgrade_retains_choice_but_new_paid_selection_is_blocked_and_reset_is_free(
    client,
    session,
    couple,
) -> None:
    entitlement = grant(session, couple)
    initial = client.get(path(couple), headers=couple["a"])
    saved = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"iconId": "sage"},
    )
    entitlements.revoke_grant(session, entitlement.id)
    retained = client.get(path(couple), headers=couple["a"])
    assert retained.status_code == 200
    assert retained.json()["iconId"] == "sage"
    assert retained.headers["ETag"] == saved.headers["ETag"]
    blocked = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"iconId": "sand"},
    )
    assert blocked.status_code == 403
    reset = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": saved.headers["ETag"]},
        json={"iconId": "original"},
    )
    assert reset.status_code == 200
    assert reset.json()["iconId"] == "original"


def test_membership_owner_scope_invalid_ids_and_required_concurrency(
    client, session, couple
) -> None:
    grant(session, couple)
    initial = client.get(path(couple), headers=couple["a"])
    assert client.get(path(couple), headers=couple["out"]).status_code == 404
    assert client.get(path(couple)).status_code == 401
    assert (
        client.patch(
            path(couple),
            headers={**couple["out"], "If-Match": initial.headers["ETag"]},
            json={"iconId": "sage"},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            path(couple),
            headers={**couple["b"], "If-Match": initial.headers["ETag"]},
            json={"iconId": "original"},
        ).status_code
        == 409
    )
    other_path = f"/api/v1/spaces/{couple['other'].id}/appearance/app-icon"
    assert (
        client.patch(
            other_path,
            headers={**couple["a"], "If-Match": initial.headers["ETag"]},
            json={"iconId": "original"},
        ).status_code
        == 409
    )
    for icon_id in ("unknown", "https://example.test/icon.png"):
        assert (
            client.patch(
                path(couple),
                headers={**couple["a"], "If-Match": initial.headers["ETag"]},
                json={"iconId": icon_id},
            ).status_code
            == 422
        )
    assert (
        client.patch(path(couple), headers=couple["a"], json={"iconId": "original"}).status_code
        == 422
    )
    for invalid in ("*", 'W/"0"', '"one", "two"'):
        assert (
            client.patch(
                path(couple),
                headers={**couple["a"], "If-Match": invalid},
                json={"iconId": "original"},
            ).status_code
            == 422
        )
    first = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"iconId": "sage"},
    )
    stale = client.patch(
        path(couple),
        headers={**couple["a"], "If-Match": initial.headers["ETag"]},
        json={"iconId": "sand"},
    )
    assert first.status_code == 200
    assert stale.status_code == 409
    assert client.get(path(couple), headers=couple["a"]).json()["iconId"] == "sage"
    assert client.get(other_path, headers=couple["a"]).json()["iconId"] == "original"


def test_personal_export_includes_only_callers_choice_and_deletion_purges_it(
    session, couple
) -> None:
    own = AppIconPreference(
        account_id=couple["anna"].id, space_id=couple["space"].id, icon_id="sage"
    )
    partner = AppIconPreference(
        account_id=couple["ben"].id, space_id=couple["space"].id, icon_id="sand"
    )
    session.add_all([own, partner])
    session.flush()
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    for scope in (TransferScope.PERSONAL, TransferScope.SHARED):
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            account_document = json.loads(archive.read("accounts.json"))
            if scope is TransferScope.PERSONAL:
                assert account_document["personalAppearance"] == {
                    "appIconId": "sage",
                    "wirDesign": "warm",
                }
            else:
                assert "personalAppearance" not in account_document
    apply_accepted_tombstone(session, couple["anna"].id, accepted_at=now())
    apply_core_cleanup(session, couple["anna"].id)
    session.expire_all()
    assert session.get(AppIconPreference, own.id) is None
    assert session.get(AppIconPreference, partner.id) is not None


def test_concurrent_initial_writes_have_one_winner_without_duplicate_rows(
    production_client,
) -> None:
    client, maker = production_client
    with maker() as setup:
        account = make_account(setup, "Concurrent icon owner")
        space = make_space(setup, account)
        endpoint = f"/api/v1/spaces/{space.id}/appearance/app-icon"
        headers = auth(sign_in(setup, account))
        account_id = account.id
        setup.commit()
    initial = client.get(endpoint, headers=headers)
    start = Barrier(2)

    def write(_: int):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.patch(
            endpoint,
            headers={**headers, "If-Match": initial.headers["ETag"]},
            json={"iconId": "original"},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(write, range(2)))
    assert sorted(response.status_code for response in responses) == [200, 409]
    with maker() as verifier:
        rows = verifier.scalars(
            select(AppIconPreference).where(AppIconPreference.account_id == account_id)
        ).all()
        assert len(rows) == 1
        assert rows[0].version == 1
