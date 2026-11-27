"""Gift code and Pro overview routes (ServerAdmin part 5, design sections 5.4-5.6)."""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from eimir_pro.api import gift_codes as routes
from eimir_pro.gift_codes import service
from eimir_pro.gift_codes.models import GiftCode
from sqlalchemy.orm import Session

from eimir.config import Deployment, get_settings
from eimir.core import clock
from eimir.core.errors import ErrorCode
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.identity.models import AccountEmail
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"
_PRO = "/api/v1/server-admin/pro"
_CODE = re.compile(r"^EIMIR-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$")
_UNKNOWN_CODE = "EIMIR-ABCD-EFGH"


def _admin_operations() -> list[Any]:
    # A fixed id keeps the parametrized test ids stable between collection and
    # execution (CI collects in one process and runs the selected ids in another).
    some = str(UUID(int=1))
    return [
        pytest.param("GET", f"{_PRO}/overview", None, id="overview"),
        pytest.param(
            "POST",
            f"{_PRO}/gift-code-batches",
            {"count": 1, "durationMonths": 3},
            id="create-batch",
        ),
        pytest.param("GET", f"{_PRO}/gift-code-batches/{some}", None, id="get-batch"),
        pytest.param("POST", f"{_PRO}/gift-code-batches/{some}/revoke", None, id="revoke-batch"),
        pytest.param(
            "PUT", f"{_PRO}/gift-codes/{some}/handed-out", {"handedOut": True}, id="handed-out"
        ),
        pytest.param("POST", f"{_PRO}/gift-codes/{some}/revoke", None, id="revoke-code"),
    ]


ADMIN_OPERATIONS = _admin_operations()


def _deployment(monkeypatch: pytest.MonkeyPatch, deployment: Deployment) -> None:
    settings = get_settings().model_copy(update={"deployment": deployment})
    monkeypatch.setattr(routes, "get_settings", lambda: settings)


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> None:
    _deployment(monkeypatch, Deployment.CLOUD)


@pytest.fixture
def allowlist(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def admin(session: Session, allowlist: None) -> dict[str, str]:
    account = make_account(session, "Operator")
    session.add(
        AccountEmail(
            account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=clock.now()
        )
    )
    session.flush()
    return auth(sign_in(session, account))


@pytest.fixture
def couple(session: Session) -> dict[str, Any]:
    founder = make_account(session, "Founder")
    space = make_space(session, founder)
    return {"space_id": str(space.id), "headers": auth(sign_in(session, founder))}


def _redeem_path(space_id: str) -> str:
    return f"/api/v1/spaces/{space_id}/gift-codes/redeem"


def _create(client: Any, headers: dict[str, str], **body: Any) -> dict[str, Any]:
    response = client.post(
        f"{_PRO}/gift-code-batches",
        json={"count": 2, "durationMonths": 3, **body},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


def _premium_grant(
    session: Session,
    space_id: str,
    *,
    source: EntitlementSourceType,
    effective_until: Any,
    metadata: dict[str, Any] | None = None,
) -> None:
    session.add(
        EntitlementGrant(
            space_id=space_id,
            source_type=source.value,
            external_reference=f"test:{uuid4()}",
            status=EntitlementStatus.ACTIVE.value,
            tier=EntitlementTier.PREMIUM.value,
            effective_from=clock.now() - timedelta(days=10),
            effective_until=effective_until,
            source_event_at=clock.now() - timedelta(days=10),
            metadata_=metadata or {},
        )
    )
    session.flush()


# --- Access -----------------------------------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_OPERATIONS)
def test_admin_routes_need_authentication(  # type: ignore[no-untyped-def]
    client, cloud, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = client.request(method, path, json=body)

    assert response.status_code == 401
    assert response.json()["code"] == ErrorCode.AUTHENTICATION_REQUIRED


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_OPERATIONS)
def test_admin_routes_refuse_an_ordinary_account(  # type: ignore[no-untyped-def]
    client, cloud, couple, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = client.request(method, path, json=body, headers=couple["headers"])

    assert response.status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_OPERATIONS)
def test_admin_routes_are_absent_on_self_hosted(  # type: ignore[no-untyped-def]
    client, admin, monkeypatch, method: str, path: str, body: dict[str, Any] | None
) -> None:
    _deployment(monkeypatch, Deployment.SELF_HOSTED)

    response = client.request(method, path, json=body, headers=admin)

    assert response.status_code == 404
    assert response.json()["code"] == routes.PRO_AREA_NOT_FOUND


def test_redeem_needs_authentication(client, cloud, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.post(_redeem_path(couple["space_id"]), json={"code": _UNKNOWN_CODE})

    assert response.status_code == 401


def test_redeem_is_absent_on_self_hosted(client, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _deployment(monkeypatch, Deployment.SELF_HOSTED)

    response = client.post(
        _redeem_path(couple["space_id"]), json={"code": _UNKNOWN_CODE}, headers=couple["headers"]
    )

    assert response.status_code == 404
    assert response.json()["code"] == routes.REDEMPTION_NOT_FOUND


def test_redeem_answers_404_to_a_non_member(client, session, cloud, admin, couple) -> None:  # type: ignore[no-untyped-def]
    batch = _create(client, admin)
    stranger = auth(sign_in(session, make_account(session, "Stranger")))

    response = client.post(
        _redeem_path(couple["space_id"]),
        json={"code": batch["codes"][0]["code"]},
        headers=stranger,
    )
    invented = client.post(
        _redeem_path(str(uuid4())), json={"code": _UNKNOWN_CODE}, headers=stranger
    )

    assert response.status_code == invented.status_code == 404
    assert response.json() == invented.json()
    assert response.json()["code"] == "SPACE_NOT_FOUND"
    code = session.get(GiftCode, UUID(batch["codes"][0]["id"]))
    assert code is not None and code.redeemed_at is None


# --- Operator routes --------------------------------------------------------


def test_overview_reports_figures_and_batches(client, session, cloud, admin, couple) -> None:  # type: ignore[no-untyped-def]
    batch = _create(client, admin, note="Spring fair")

    response = client.get(f"{_PRO}/overview", headers=admin)

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    payload = response.json()
    assert payload["spacesTotal"] >= 1
    assert set(payload) >= {
        "spacesTotal",
        "spacesPremium",
        "premiumByPlay",
        "premiumByGift",
        "play",
        "cancellations30d",
        "runningGifts",
        "runningGiftsTotal",
        "batches",
    }
    assert set(payload["play"]) == {"active", "cancelledRunning", "paymentProblem", "ended30d"}
    summary = next(item for item in payload["batches"] if item["id"] == batch["id"])
    assert summary["note"] == "Spring fair"
    assert (summary["total"], summary["open"], summary["redeemed"]) == (2, 2, 0)
    assert "codes" not in summary


def test_create_batch_returns_its_codes(client, cloud, admin) -> None:  # type: ignore[no-untyped-def]
    until = (clock.now() + timedelta(days=30)).replace(microsecond=0)

    response = client.post(
        f"{_PRO}/gift-code-batches",
        json={
            "count": 3,
            "durationMonths": 6,
            "redeemableUntil": until.isoformat(),
            "note": "  Raffle  ",
        },
        headers=admin,
    )

    assert response.status_code == 201
    assert response.headers["Cache-Control"] == "private, no-store"
    batch = response.json()
    assert batch["durationMonths"] == 6
    assert batch["note"] == "Raffle"
    assert batch["redeemableUntil"].startswith(until.date().isoformat())
    assert batch["total"] == batch["open"] == 3
    assert len(batch["codes"]) == 3
    assert all(_CODE.match(code["code"]) for code in batch["codes"])
    assert {code["state"] for code in batch["codes"]} == {"open"}
    assert set(batch["codes"][0]) == {
        "id",
        "code",
        "state",
        "handedOutAt",
        "redeemedAt",
        "redeemedSpaceId",
    }


@pytest.mark.parametrize(
    "body",
    [
        {"count": 0, "durationMonths": 3},
        {"count": 101, "durationMonths": 3},
        {"count": 1, "durationMonths": 2},
        {"count": 1, "durationMonths": 3, "note": "x" * 121},
    ],
)
def test_create_batch_refuses_invalid_input(client, cloud, admin, body) -> None:  # type: ignore[no-untyped-def]
    response = client.post(f"{_PRO}/gift-code-batches", json=body, headers=admin)

    assert response.status_code == 422
    assert response.json()["code"] == service.GiftCodeErrorCode.BATCH_INVALID


def test_create_batch_refuses_a_deadline_today(client, cloud, admin) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        f"{_PRO}/gift-code-batches",
        json={"count": 1, "durationMonths": 3, "redeemableUntil": clock.now().isoformat()},
        headers=admin,
    )

    assert response.status_code == 422
    assert response.json()["code"] == service.GiftCodeErrorCode.BATCH_INVALID


def test_get_batch_shows_its_codes(client, cloud, admin) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, admin)

    response = client.get(f"{_PRO}/gift-code-batches/{created['id']}", headers=admin)

    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.json() == created


@pytest.mark.parametrize("batch_id", [str(UUID(int=2)), "not-an-id"], ids=["unknown", "malformed"])
def test_unknown_batch_is_404(client, cloud, admin, batch_id: str) -> None:  # type: ignore[no-untyped-def]
    for method, path in (
        ("GET", f"{_PRO}/gift-code-batches/{batch_id}"),
        ("POST", f"{_PRO}/gift-code-batches/{batch_id}/revoke"),
    ):
        response = client.request(method, path, headers=admin)
        assert response.status_code == 404
        assert response.json()["code"] == service.GiftCodeErrorCode.BATCH_NOT_FOUND


@pytest.mark.parametrize("code_id", [str(UUID(int=3)), "not-an-id"], ids=["unknown", "malformed"])
def test_unknown_code_is_404(client, cloud, admin, code_id: str) -> None:  # type: ignore[no-untyped-def]
    for method, path, body in (
        ("PUT", f"{_PRO}/gift-codes/{code_id}/handed-out", {"handedOut": True}),
        ("POST", f"{_PRO}/gift-codes/{code_id}/revoke", None),
    ):
        response = client.request(method, path, json=body, headers=admin)
        assert response.status_code == 404
        assert response.json()["code"] == service.GiftCodeErrorCode.NOT_FOUND


def test_handed_out_toggles_and_returns_the_batch(client, cloud, admin) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, admin)
    code_id = created["codes"][0]["id"]

    marked = client.put(
        f"{_PRO}/gift-codes/{code_id}/handed-out", json={"handedOut": True}, headers=admin
    )
    unmarked = client.put(
        f"{_PRO}/gift-codes/{code_id}/handed-out", json={"handedOut": False}, headers=admin
    )

    assert marked.status_code == unmarked.status_code == 200
    assert marked.headers["Cache-Control"] == "private, no-store"
    marked_code = next(code for code in marked.json()["codes"] if code["id"] == code_id)
    assert marked_code["state"] == "handed_out"
    assert marked_code["handedOutAt"] is not None
    assert marked.json()["handedOut"] == 1
    unmarked_code = next(code for code in unmarked.json()["codes"] if code["id"] == code_id)
    assert (unmarked_code["state"], unmarked_code["handedOutAt"]) == ("open", None)


def test_handed_out_needs_a_strict_boolean(client, cloud, admin) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, admin)

    response = client.put(
        f"{_PRO}/gift-codes/{created['codes'][0]['id']}/handed-out",
        json={"handedOut": "yes"},
        headers=admin,
    )

    assert response.status_code == 422


def test_revoke_code_and_batch(client, cloud, admin) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, admin, count=3)
    first = created["codes"][0]["id"]

    revoked = client.post(f"{_PRO}/gift-codes/{first}/revoke", headers=admin)
    handed_out = client.put(
        f"{_PRO}/gift-codes/{first}/handed-out", json={"handedOut": True}, headers=admin
    )
    batch = client.post(f"{_PRO}/gift-code-batches/{created['id']}/revoke", headers=admin)

    assert revoked.status_code == 200
    assert revoked.headers["Cache-Control"] == "private, no-store"
    states = {code["id"]: code["state"] for code in revoked.json()["codes"]}
    assert states[first] == "revoked"
    assert revoked.json()["revoked"] == 1
    assert handed_out.status_code == 422
    assert handed_out.json()["code"] == service.GiftCodeErrorCode.NOT_OPEN
    assert batch.status_code == 200
    assert batch.json()["revokedAt"] is not None
    assert {code["state"] for code in batch.json()["codes"]} == {"revoked"}
    assert batch.json()["revoked"] == 3


def test_a_redeemed_code_shows_its_space_and_cannot_be_revoked(  # type: ignore[no-untyped-def]
    client, cloud, admin, couple
) -> None:
    created = _create(client, admin)
    code = created["codes"][0]
    redeemed = client.post(
        _redeem_path(couple["space_id"]), json={"code": code["code"]}, headers=couple["headers"]
    )
    assert redeemed.status_code == 200, redeemed.text

    batch = client.get(f"{_PRO}/gift-code-batches/{created['id']}", headers=admin).json()
    revoke = client.post(f"{_PRO}/gift-codes/{code['id']}/revoke", headers=admin)

    shown = next(item for item in batch["codes"] if item["id"] == code["id"])
    assert shown["state"] == "redeemed"
    assert shown["redeemedSpaceId"] == couple["space_id"]
    assert shown["redeemedAt"] is not None
    assert batch["redeemed"] == 1
    assert revoke.status_code == 422
    assert revoke.json()["code"] == service.GiftCodeErrorCode.ALREADY_REDEEMED


# --- Couple redemption ------------------------------------------------------


def test_redeem_grants_pro_and_appends_a_second_code(client, cloud, admin, couple) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, admin)
    first, second = (code["code"] for code in created["codes"])

    # Typed loosely: lowercase, no prefix, spaces instead of hyphens.
    loose = first.removeprefix("EIMIR-").replace("-", " ").lower()
    new = client.post(
        _redeem_path(couple["space_id"]), json={"code": loose}, headers=couple["headers"]
    )
    extended = client.post(
        _redeem_path(couple["space_id"]), json={"code": second}, headers=couple["headers"]
    )

    assert new.status_code == extended.status_code == 200
    assert new.headers["Cache-Control"] == "private, no-store"
    assert set(new.json()) == {"effectiveUntil", "extended"}
    assert new.json()["extended"] is False
    assert extended.json()["extended"] is True
    assert extended.json()["effectiveUntil"] > new.json()["effectiveUntil"]
    entitlement = client.get(
        f"/api/v1/spaces/{couple['space_id']}/entitlements", headers=couple["headers"]
    )
    assert entitlement.json()["tier"] == "PREMIUM"


def test_redeem_replay_answers_the_same(client, cloud, admin, couple) -> None:  # type: ignore[no-untyped-def]
    code = _create(client, admin)["codes"][0]["code"]

    first = client.post(
        _redeem_path(couple["space_id"]), json={"code": code}, headers=couple["headers"]
    )
    again = client.post(
        _redeem_path(couple["space_id"]), json={"code": code}, headers=couple["headers"]
    )

    assert first.status_code == again.status_code == 200
    assert first.json() == again.json()


def test_redeem_problems_surface_their_codes(  # type: ignore[no-untyped-def]
    client, session, cloud, admin, couple
) -> None:
    codes = [code["code"] for code in _create(client, admin, count=3)["codes"]]
    other_founder = make_account(session, "Other")
    other_space = str(make_space(session, other_founder).id)
    other = auth(sign_in(session, other_founder))
    assert (
        client.post(_redeem_path(other_space), json={"code": codes[0]}, headers=other).status_code
        == 200
    )
    unlimited_founder = make_account(session, "Unlimited")
    unlimited_space = str(make_space(session, unlimited_founder).id)
    _premium_grant(
        session,
        unlimited_space,
        source=EntitlementSourceType.ADMIN_GRANT,
        effective_until=None,
    )
    renewing_founder = make_account(session, "Renewing")
    renewing_space = str(make_space(session, renewing_founder).id)
    _premium_grant(
        session,
        renewing_space,
        source=EntitlementSourceType.GOOGLE_PLAY,
        effective_until=clock.now() + timedelta(days=20),
        metadata={"autoRenewing": True},
    )

    cases = [
        (couple["space_id"], couple["headers"], _UNKNOWN_CODE, 422, "GIFT_CODE_INVALID"),
        (couple["space_id"], couple["headers"], "not a code", 422, "GIFT_CODE_INVALID"),
        (couple["space_id"], couple["headers"], codes[0], 409, "GIFT_CODE_USED"),
        (
            unlimited_space,
            auth(sign_in(session, unlimited_founder)),
            codes[1],
            409,
            "GIFT_CODE_UNLIMITED",
        ),
        (
            renewing_space,
            auth(sign_in(session, renewing_founder)),
            codes[2],
            409,
            "GIFT_CODE_SUBSCRIPTION_ACTIVE",
        ),
    ]
    for space_id, headers, code, status, problem in cases:
        response = client.post(_redeem_path(space_id), json={"code": code}, headers=headers)
        assert (response.status_code, response.json()["code"]) == (status, problem), code
        assert code not in response.text


def test_redeem_is_rate_limited(client, cloud, couple) -> None:  # type: ignore[no-untyped-def]
    for _ in range(5):
        response = client.post(
            _redeem_path(couple["space_id"]),
            json={"code": _UNKNOWN_CODE},
            headers=couple["headers"],
        )
        assert response.status_code == 422

    limited = client.post(
        _redeem_path(couple["space_id"]), json={"code": _UNKNOWN_CODE}, headers=couple["headers"]
    )

    assert limited.status_code == 429
    assert limited.json()["code"] == ErrorCode.RATE_LIMITED


def test_redeem_rejects_an_oversized_or_extra_body(client, cloud, couple) -> None:  # type: ignore[no-untyped-def]
    for body in ({"code": "A" * 65}, {"code": _UNKNOWN_CODE, "spaceId": str(uuid4())}, {}):
        response = client.post(
            _redeem_path(couple["space_id"]), json=body, headers=couple["headers"]
        )
        assert response.status_code == 422
        assert response.json()["code"] == ErrorCode.VALIDATION_FAILED


def test_a_failed_redemption_logs_no_code(  # type: ignore[no-untyped-def]
    client, session, cloud, admin, couple, caplog
) -> None:
    code = _create(client, admin)["codes"][0]["code"]
    other_founder = make_account(session, "Other")
    other_space = str(make_space(session, other_founder).id)
    other = auth(sign_in(session, other_founder))
    assert (
        client.post(_redeem_path(other_space), json={"code": code}, headers=other).status_code
        == 200
    )

    with caplog.at_level(logging.DEBUG):
        used = client.post(
            _redeem_path(couple["space_id"]), json={"code": code}, headers=couple["headers"]
        )
        unknown = client.post(
            _redeem_path(couple["space_id"]),
            json={"code": _UNKNOWN_CODE},
            headers=couple["headers"],
        )

    assert used.status_code == 409
    assert unknown.status_code == 422
    for text in (code, code.replace("-", ""), _UNKNOWN_CODE):
        assert text not in caplog.text


def test_a_refused_redemption_still_counts_in_production(  # type: ignore[no-untyped-def]
    production_client, monkeypatch
) -> None:
    """Each request commits or rolls back on its own; a refusal must not undo its attempt."""
    client, maker = production_client
    _deployment(monkeypatch, Deployment.CLOUD)
    with maker.begin() as setup:
        founder = make_account(setup, "Founder")
        space_id = str(make_space(setup, founder).id)
        headers = auth(sign_in(setup, founder))

    statuses = [
        client.post(
            _redeem_path(space_id), json={"code": _UNKNOWN_CODE}, headers=headers
        ).status_code
        for _ in range(6)
    ]

    assert statuses == [422] * 5 + [429]
