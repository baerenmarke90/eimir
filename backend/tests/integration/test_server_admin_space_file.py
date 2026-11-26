"""ServerAdmin People search, Space file and individual storage quota (#2324)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from eimir.administration.models import InstanceAdministrationActionEvent
from eimir.attachments.quota_override import GIGABYTE, SpaceStorageQuotaOverride
from eimir.config import Deployment, get_settings
from eimir.core.clock import now
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"
FREE = 5 * GIGABYTE
PREMIUM = 50 * GIGABYTE


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _deployment(monkeypatch, deployment: Deployment):  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(
        update={
            "deployment": deployment,
            "storage_quota_free_bytes": FREE,
            "storage_quota_premium_bytes": PREMIUM,
        }
    )
    monkeypatch.setattr("eimir.api.v1.server_admin_space_file.get_settings", lambda: settings)
    monkeypatch.setattr("eimir.attachments.quota.get_settings", lambda: settings)
    return settings


@pytest.fixture
def cloud(monkeypatch, server_admin_allowlist):  # type: ignore[no-untyped-def]
    return _deployment(monkeypatch, Deployment.CLOUD)


def _admin(session):  # type: ignore[no-untyped-def]
    from eimir.identity.models import AccountEmail

    account = make_account(session, "Operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    token = sign_in(session, account)
    session.flush()
    return account, token


def _actions(session, space_id):  # type: ignore[no-untyped-def]
    return [
        event.action
        for event in session.execute(
            select(InstanceAdministrationActionEvent)
            .where(InstanceAdministrationActionEvent.target_space_id == space_id)
            .order_by(InstanceAdministrationActionEvent.created_at)
        ).scalars()
    ]


def _quota_url(space) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/server-admin/spaces/{space.id}/storage-quota"


# --- Individual storage quota ----------------------------------------------


def test_setting_a_quota_replaces_the_tier_value_and_is_audited(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    until = now() + timedelta(days=30)

    response = client.put(
        _quota_url(space),
        json={"quotaGb": 80, "effectiveUntil": until.isoformat()},
        headers=auth(token),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["quotaBytes"] == 80 * GIGABYTE
    assert body["tierQuotaBytes"] == FREE
    assert body["override"]["quotaBytes"] == 80 * GIGABYTE
    assert body["override"]["effectiveUntil"] is not None
    row = session.get(SpaceStorageQuotaOverride, space.id)
    assert row is not None and row.set_by_account_id == admin.id
    assert _actions(session, space.id) == ["space_storage_quota_set"]


def test_setting_again_replaces_the_previous_override(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    client.put(_quota_url(space), json={"quotaGb": 80}, headers=auth(token))

    response = client.put(_quota_url(space), json={"quotaGb": 2}, headers=auth(token))

    assert response.status_code == 200
    assert response.json()["quotaBytes"] == 2 * GIGABYTE
    assert response.json()["override"]["effectiveUntil"] is None


def test_clearing_restores_the_tier_value_and_is_audited(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    client.put(_quota_url(space), json={"quotaGb": 80}, headers=auth(token))

    response = client.delete(_quota_url(space), headers=auth(token))

    assert response.status_code == 204
    assert session.get(SpaceStorageQuotaOverride, space.id) is None
    assert _actions(session, space.id) == ["space_storage_quota_set", "space_storage_quota_cleared"]


def test_clearing_without_an_override_records_nothing(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)

    assert client.delete(_quota_url(space), headers=auth(token)).status_code == 204
    assert _actions(session, space.id) == []


@pytest.mark.parametrize("quota_gb", [0, 1025, -3])
def test_quota_outside_one_gb_to_one_tb_is_rejected(client, session, cloud, quota_gb) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)

    response = client.put(_quota_url(space), json={"quotaGb": quota_gb}, headers=auth(token))

    assert response.status_code == 422
    assert session.get(SpaceStorageQuotaOverride, space.id) is None


def test_an_end_date_in_the_past_is_rejected(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)

    response = client.put(
        _quota_url(space),
        json={"quotaGb": 10, "effectiveUntil": (now() - timedelta(minutes=1)).isoformat()},
        headers=auth(token),
    )

    assert response.status_code == 422
    assert _actions(session, space.id) == []


def test_self_hosted_refuses_the_quota_override(
    client, session, monkeypatch, server_admin_allowlist
) -> None:  # type: ignore[no-untyped-def]
    _deployment(monkeypatch, Deployment.SELF_HOSTED)
    admin, token = _admin(session)
    space = make_space(session, admin)

    assert (
        client.put(_quota_url(space), json={"quotaGb": 10}, headers=auth(token)).status_code == 404
    )
    assert client.delete(_quota_url(space), headers=auth(token)).status_code == 404


def test_unknown_space_is_not_found(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)
    url = "/api/v1/server-admin/spaces/00000000-0000-0000-0000-000000000000/storage-quota"

    assert client.put(url, json={"quotaGb": 10}, headers=auth(token)).status_code == 404


def test_ordinary_account_cannot_set_a_quota(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Someone")
    token = sign_in(session, account)
    space = make_space(session, account)

    assert (
        client.put(_quota_url(space), json={"quotaGb": 10}, headers=auth(token)).status_code == 403
    )


# --- People search -----------------------------------------------------------


def _member(session, space, name: str, email: str, *, status: str = "ACTIVE"):  # type: ignore[no-untyped-def]
    from eimir.identity.models import AccountEmail
    from eimir.relationship.models import Membership

    account = make_account(session, name)
    session.add(AccountEmail(account_id=account.id, email=email, is_primary=True))
    session.add(
        Membership(
            space_id=space.id,
            account_id=account.id,
            status=status,
            joined_at=now(),
            ended_at=now() if status != "ACTIVE" else None,
        )
    )
    session.flush()
    return account


def _search(client, token, q: str):  # type: ignore[no-untyped-def]
    return client.get("/api/v1/server-admin/search", params={"q": q}, headers=auth(token))


def test_search_by_email_part_finds_the_account_and_its_spaces(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    member = _member(session, space, "Partner", "lena.partner@example.test")

    response = _search(client, token, "lena.part")

    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["id"] for item in body["accounts"]] == [str(member.id)]
    assert [item["id"] for item in body["spaces"]] == [str(space.id)]


def test_search_by_space_id_finds_the_space(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)

    body = _search(client, token, str(space.id)).json()

    assert [item["id"] for item in body["spaces"]] == [str(space.id)]
    assert body["accounts"] == []


@pytest.mark.parametrize("query", ["%", "_", "%%", "a"])
def test_wildcards_and_too_short_queries_match_nothing(client, session, cloud, query) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    _member(session, space, "Partner", "x_y%z@example.test")

    body = _search(client, token, query).json()

    assert body["accounts"] == [] and body["spaces"] == []


def test_an_escaped_wildcard_matches_it_literally(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    literal = _member(session, space, "Literal", "x_y@example.test")
    _member(session, space, "Other", "xay@example.test")

    body = _search(client, token, "x_y").json()

    assert [item["id"] for item in body["accounts"]] == [str(literal.id)]


def test_search_returns_at_most_twenty_accounts(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    from eimir.identity.models import AccountEmail

    _, token = _admin(session)
    for index in range(25):
        account = make_account(session, f"Bulk {index}")
        session.add(
            AccountEmail(account_id=account.id, email=f"bulk{index}@many.test", is_primary=True)
        )
    session.flush()

    assert len(_search(client, token, "@many.test").json()["accounts"]) == 20


def test_ordinary_account_cannot_search(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Someone")
    token = sign_in(session, account)

    assert _search(client, token, "example").status_code == 403


# --- Space file --------------------------------------------------------------


def _file(client, token, space):  # type: ignore[no-untyped-def]
    return client.get(f"/api/v1/server-admin/spaces/{space.id}/file", headers=auth(token))


def test_space_file_lists_members_without_names_and_is_audited(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    _member(session, space, "Secret Partner Name", "partner@example.test")
    _member(session, space, "Former", "former@example.test", status="LEFT")

    response = _file(client, token, space)

    assert response.status_code == 200, response.text
    assert "Secret Partner Name" not in response.text
    assert "Operator" not in response.text
    members = {item["primaryEmail"]: item for item in response.json()["members"]}
    assert set(members) == {ADMIN_EMAIL, "partner@example.test", "former@example.test"}
    assert members["former@example.test"]["membershipStatus"] == "LEFT"
    assert members[ADMIN_EMAIL]["emailVerified"] is True
    assert "displayName" not in members[ADMIN_EMAIL]
    assert _actions(session, space.id) == ["space_file_viewed"]


def test_space_file_view_is_audited_for_a_space_without_members(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    from sqlalchemy import update

    from eimir.relationship.models import Membership

    admin, token = _admin(session)
    space = make_space(session, admin)
    session.execute(update(Membership).where(Membership.space_id == space.id).values(status="LEFT"))
    session.flush()

    response = _file(client, token, space)

    assert response.status_code == 200
    assert _actions(session, space.id) == ["space_file_viewed"]


def test_space_file_splits_storage_by_media_type_and_shows_the_override(
    client, session, cloud
) -> None:  # type: ignore[no-untyped-def]
    from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus

    admin, token = _admin(session)
    space = make_space(session, admin)
    for media_type, size in (("IMAGE", 300), ("IMAGE", 200), ("VIDEO", 1_000)):
        session.add(
            Attachment(
                space_id=space.id,
                owner_id=admin.id,
                privacy_class="OWNER_ONLY",
                status=AttachmentStatus.READY.value,
                media_type=media_type,
                declared_mime_type="image/jpeg",
                declared_size=size,
                mime_type="image/jpeg",
                size=size,
                ready_at=now(),
                payload=AttachmentPayload(original_name="file"),
            )
        )
    session.flush()
    client.put(_quota_url(space), json={"quotaGb": 7}, headers=auth(token))

    storage = _file(client, token, space).json()["storage"]

    assert storage["usedBytes"] == 1_500
    assert storage["quotaBytes"] == 7 * GIGABYTE
    assert storage["tierQuotaBytes"] == FREE
    assert storage["byMediaType"] == [
        {"mediaType": "VIDEO", "bytes": 1_000},
        {"mediaType": "IMAGE", "bytes": 500},
    ]


def test_space_file_timeline_shows_grants_and_admin_actions_but_not_views(
    client, session, cloud
) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    client.post(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement/grants",
        json={"reason": "beta"},
        headers=auth(token),
    )
    _file(client, token, space)

    timeline = _file(client, token, space).json()["timeline"]

    kinds = [entry["kind"] for entry in timeline]
    assert "entitlement_grant" in kinds
    assert "space_entitlement_granted" in kinds
    assert "space_file_viewed" not in kinds


def test_space_file_of_an_unknown_space_is_not_found(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)
    response = client.get(
        "/api/v1/server-admin/spaces/00000000-0000-0000-0000-000000000000/file",
        headers=auth(token),
    )

    assert response.status_code == 404


def test_ordinary_account_cannot_open_a_space_file(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Someone")
    token = sign_in(session, account)
    space = make_space(session, account)

    assert _file(client, token, space).status_code == 403
    assert _actions(session, space.id) == []


def test_self_hosted_space_file_is_unmetered(
    client, session, monkeypatch, server_admin_allowlist
) -> None:  # type: ignore[no-untyped-def]
    _deployment(monkeypatch, Deployment.SELF_HOSTED)
    admin, token = _admin(session)
    space = make_space(session, admin)

    storage = _file(client, token, space).json()["storage"]

    assert storage["quotaBytes"] is None and storage["override"] is None


# --- Account detail lists its Spaces -------------------------------------------


def test_account_detail_lists_its_spaces(client, session, cloud) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    space = make_space(session, admin)
    member = _member(session, space, "Partner", "partner@example.test", status="REMOVED")

    response = client.get(f"/api/v1/server-admin/accounts/{member.id}", headers=auth(token))

    assert response.status_code == 200
    spaces = response.json()["spaces"]
    assert [(item["spaceId"], item["membershipStatus"]) for item in spaces] == [
        (str(space.id), "REMOVED")
    ]
    assert spaces[0]["since"] is not None
