"""Integration tests for the personal Daily Quote Pro capability (#1151).

Verifies:
- Free Space without Pro capability receives 403 PREMIUM_ENTITLEMENT_REQUIRED for:
  - Daily Quote resolution
  - Preference read
  - Preference write
  - Catalog retrieval
- Pro Space with `daily.quote` receives 200 OK with deterministic daily quote and metadata.
- Rights classification is PUBLIC_DOMAIN and attribution is required.
- Preference read returns default when unset with strong ETag token.
- Preference PATCH requires valid If-Match token; rejects conflicts with 409.
- Validation rejects unknown source or category IDs with 422.
- Preference isolation: Anna and Ben have completely independent preferences and quotes.
- Disabling quote returns enabled=False and quote=None.
- Cross-space isolation: non-members are rejected.
- Catalog endpoint exposes curated sources and categories.
- Demo space seeds active `daily.quote` entitlement and distinct preferences for Lea & Alex.
- Production environment ignores TEST_FIXTURE grants (fail-closed security).
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.config import Deployment, Environment
from eimir.core.clock import now
from eimir.demo import create_demo_space
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.quotes import catalog
from eimir.quotes import service as preference_service
from eimir.quotes.models import DailyQuotePreference
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")

    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()

    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def _grant_quote_capability(session: Session, space_id: UUID, account_id: UUID) -> None:
    entitlement_service.record_grant(
        session,
        space_id=space_id,
        account_id=account_id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.DAILY_QUOTE.value],
    )
    session.flush()


def test_free_space_quote_endpoints_rejected_with_403(client, couple) -> None:
    space_id = couple["space"].id
    headers = auth(couple["token_a"])

    # 1. Daily quote endpoint
    res_quote = client.get(f"/api/v1/spaces/{space_id}/daily-quote", headers=headers)
    assert res_quote.status_code == 403
    assert res_quote.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert "daily.quote" in res_quote.json()["detail"]

    # 2. Preferences GET
    res_pref_get = client.get(f"/api/v1/spaces/{space_id}/daily-quote/preferences", headers=headers)
    assert res_pref_get.status_code == 403
    assert res_pref_get.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"

    # 3. Preferences PATCH
    res_pref_patch = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**headers, "If-Match": '"some-token"'},
        json={"enabled": False},
    )
    assert res_pref_patch.status_code == 403
    assert res_pref_patch.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"

    # 4. Catalog GET
    res_catalog = client.get(f"/api/v1/spaces/{space_id}/daily-quote/catalog", headers=headers)
    assert res_catalog.status_code == 403
    assert res_catalog.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_pro_space_receives_deterministic_daily_quote_and_metadata(
    client, session: Session, couple
) -> None:
    space_id = couple["space"].id
    _grant_quote_capability(session, space_id, couple["anna"].id)
    headers = auth(couple["token_a"])

    response = client.get(f"/api/v1/spaces/{space_id}/daily-quote", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["enabled"] is True
    assert "checkedOn" in data
    quote = data["quote"]
    assert quote is not None
    assert quote["id"]
    assert len(quote["text"]) > 0
    assert len(quote["authorDisplay"]) > 0
    assert quote["rightsClassification"] == "PUBLIC_DOMAIN"
    assert quote["attributionRequired"] is True
    assert isinstance(quote["categoryIds"], list)
    assert quote["sourceId"] in {s.id for s in catalog.get_sources()}

    # Call again: verify deterministic quote resolution on same day
    response2 = client.get(f"/api/v1/spaces/{space_id}/daily-quote", headers=headers)
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["quote"]["id"] == quote["id"]
    assert data2["quote"]["text"] == quote["text"]


def test_daily_quote_preferences_crud_and_optimistic_concurrency(
    client, session: Session, couple
) -> None:
    space_id = couple["space"].id
    _grant_quote_capability(session, space_id, couple["anna"].id)
    headers = auth(couple["token_a"])

    # 1. Read default preferences
    get_res = client.get(f"/api/v1/spaces/{space_id}/daily-quote/preferences", headers=headers)
    assert get_res.status_code == 200
    assert "ETag" in get_res.headers
    etag = get_res.headers["ETag"]
    pref_data = get_res.json()
    assert pref_data["enabled"] is True
    assert pref_data["version"] == 0
    assert set(pref_data["selectedSourceIds"]) == {s.id for s in catalog.get_sources()}
    assert set(pref_data["selectedCategoryIds"]) == {c.id for c in catalog.get_categories()}

    # 2. PATCH without If-Match returns 422
    patch_missing_header = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers=headers,
        json={"enabled": True},
    )
    assert patch_missing_header.status_code == 422

    # 3. PATCH with stale / mismatched ETag returns 409 RESOURCE_VERSION_CONFLICT
    patch_stale = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**headers, "If-Match": '"wrong-version-token"'},
        json={"enabled": True},
    )
    assert patch_stale.status_code == 409
    assert patch_stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    # 4. PATCH with unknown source returns 422
    patch_invalid_source = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**headers, "If-Match": etag},
        json={"selectedSourceIds": ["unknown_source_xyz"]},
    )
    assert patch_invalid_source.status_code == 422

    # 5. PATCH with unknown category returns 422
    patch_invalid_category = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**headers, "If-Match": etag},
        json={"selectedCategoryIds": ["unknown_category_xyz"]},
    )
    assert patch_invalid_category.status_code == 422

    # 6. Valid PATCH to filter sources and categories
    patch_valid = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**headers, "If-Match": etag},
        json={
            "selectedSourceIds": ["stoic_philosophy"],
            "selectedCategoryIds": ["serenity"],
            "locale": "de",
        },
    )
    assert patch_valid.status_code == 200
    new_etag = patch_valid.headers["ETag"]
    assert new_etag != etag
    updated_data = patch_valid.json()
    assert updated_data["version"] == 1
    assert updated_data["selectedSourceIds"] == ["stoic_philosophy"]
    assert updated_data["selectedCategoryIds"] == ["serenity"]
    assert updated_data["locale"] == "de"

    # Verify daily quote now conforms to preferences
    quote_res = client.get(f"/api/v1/spaces/{space_id}/daily-quote", headers=headers)
    assert quote_res.status_code == 200
    q = quote_res.json()["quote"]
    assert q["sourceId"] == "stoic_philosophy"
    assert "serenity" in q["categoryIds"]

    # 7. Disabling daily quote in preferences returns enabled=False and quote=None
    disable_patch = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**headers, "If-Match": new_etag},
        json={"enabled": False},
    )
    assert disable_patch.status_code == 200
    assert disable_patch.json()["enabled"] is False

    quote_disabled_res = client.get(f"/api/v1/spaces/{space_id}/daily-quote", headers=headers)
    assert quote_disabled_res.status_code == 200
    assert quote_disabled_res.json()["enabled"] is False
    assert quote_disabled_res.json()["quote"] is None


def test_partner_preference_isolation_and_cross_space_rejection(
    client, session: Session, couple
) -> None:
    space_id = couple["space"].id
    _grant_quote_capability(session, space_id, couple["anna"].id)
    token_a = couple["token_a"]
    token_b = couple["token_b"]

    # Anna personalizes her preferences to stoic philosophy only
    anna_get = client.get(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences", headers=auth(token_a)
    )
    anna_etag = anna_get.headers["ETag"]
    client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**auth(token_a), "If-Match": anna_etag},
        json={"selectedSourceIds": ["stoic_philosophy"]},
    )

    # Ben reads his preferences: must be default and completely uninfluenced by Anna
    ben_get = client.get(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences", headers=auth(token_b)
    )
    assert ben_get.status_code == 200
    ben_data = ben_get.json()
    assert ben_data["version"] == 0
    assert ben_data["accountId"] == str(couple["ben"].id)
    assert len(ben_data["selectedSourceIds"]) == len(catalog.get_sources())

    # Ben cannot update Anna's preference using Anna's ETag
    ben_patch_attempt = client.patch(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers={**auth(token_b), "If-Match": anna_etag},
        json={"enabled": False},
    )
    # Since Ben's own version is absent / version 0, Anna's token conflicts with Ben's state
    assert ben_patch_attempt.status_code == 409

    # Cross-space security: outsider cannot call quote endpoints on couple's space
    outsider_quote = client.get(
        f"/api/v1/spaces/{space_id}/daily-quote", headers=auth(couple["token_outsider"])
    )
    assert outsider_quote.status_code in {403, 404}


def test_catalog_endpoint_returns_sources_and_categories(client, session: Session, couple) -> None:
    space_id = couple["space"].id
    _grant_quote_capability(session, space_id, couple["anna"].id)

    response = client.get(
        f"/api/v1/spaces/{space_id}/daily-quote/catalog",
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 200
    data = response.json()

    assert "sources" in data
    assert "categories" in data
    source_ids = [s["id"] for s in data["sources"]]
    category_ids = [c["id"] for c in data["categories"]]

    assert "classic_literature" in source_ids
    assert "stoic_philosophy" in source_ids
    assert "poetic_wisdom" in source_ids

    assert "love" in category_ids
    assert "life" in category_ids
    assert "philosophy" in category_ids
    assert "mindfulness" in category_ids
    assert "serenity" in category_ids
    assert "motivation" in category_ids

    for source in data["sources"]:
        assert source["rightsClassification"] == "PUBLIC_DOMAIN"


def test_demo_space_seeds_capabilities_and_distinct_quote_preferences(
    session: Session,
) -> None:
    from datetime import date

    result = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password="demo-password-123",
        alex_password="demo-password-123",
        reference_date=date(2026, 8, 24),
    )

    # 1. Pro capabilities active
    effective = entitlement_service.get_effective_space_entitlement(session, result.space_id)
    assert effective.tier == EntitlementTier.PREMIUM
    assert effective.status == EntitlementStatus.ACTIVE
    assert Capability.DAILY_QUOTE.value in effective.capabilities
    assert Capability.DAILY_INSIGHTS.value in effective.capabilities

    # 2. Distinct preferences persisted for Lea and Alex
    lea_pref = preference_service.get_persisted_preference(session, result.lea_id)
    assert lea_pref is not None
    assert lea_pref.enabled is True
    assert set(lea_pref.selected_source_ids) == {
        "poetic_wisdom",
        "classic_literature",
    }
    assert set(lea_pref.selected_category_ids) == {"love", "mindfulness"}

    alex_pref = preference_service.get_persisted_preference(session, result.alex_id)
    assert alex_pref is not None
    assert alex_pref.enabled is True
    assert set(alex_pref.selected_source_ids) == {"stoic_philosophy"}
    assert set(alex_pref.selected_category_ids) == {"philosophy", "serenity"}


def test_restored_fixture_fails_closed_in_production(session: Session, couple, monkeypatch) -> None:
    space_id = couple["space"].id
    _grant_quote_capability(session, space_id, couple["anna"].id)

    # In TEST/DEV, capability is active
    effective_test = entitlement_service.get_effective_space_entitlement(session, space_id)
    assert Capability.DAILY_QUOTE.value in effective_test.capabilities

    # In PRODUCTION, TEST_FIXTURE source is rejected fail-closed
    monkeypatch.setattr(
        entitlement_service,
        "get_settings",
        lambda: SimpleNamespace(
            environment=Environment.PRODUCTION,
            deployment=Deployment.CLOUD,
        ),
    )

    effective_prod = entitlement_service.get_effective_space_entitlement(session, space_id)
    assert effective_prod.tier == EntitlementTier.FREE
    assert Capability.DAILY_QUOTE.value not in effective_prod.capabilities


def test_concurrent_first_preference_writes_have_one_winner_and_conflict(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker() as setup:
        manager = make_account(setup, "Quote Concurrent Manager")
        space = make_space(setup, manager)
        _grant_quote_capability(setup, space.id, manager.id)
        token = sign_in(setup, manager)
        space_id = space.id
        account_id = manager.id
        setup.commit()

    initial_res = client.get(
        f"/api/v1/spaces/{space_id}/daily-quote/preferences",
        headers=auth(token),
    )
    assert initial_res.status_code == 200
    initial_etag = initial_res.headers["ETag"]
    assert initial_etag.strip('"').endswith(":absent")

    start = Barrier(2)

    def write_patch(payload: dict[str, object]):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.patch(
            f"/api/v1/spaces/{space_id}/daily-quote/preferences",
            json=payload,
            headers={**auth(token), "If-Match": initial_etag},
        )

    payloads = [{"enabled": False}, {"locale": "en"}]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(write_patch, payloads))

    # Exactly one winner 200 OK and exactly one conflict 409 RESOURCE_VERSION_CONFLICT
    assert sorted(r.status_code for r in responses) == [200, 409]
    conflict_response = next(r for r in responses if r.status_code == 409)
    assert conflict_response.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    # Verify single persisted preference row with version 1
    with maker() as verifier:
        count = verifier.execute(
            select(func.count())
            .select_from(DailyQuotePreference)
            .where(DailyQuotePreference.account_id == account_id)
        ).scalar_one()
        assert count == 1

        persisted = verifier.execute(
            select(DailyQuotePreference).where(DailyQuotePreference.account_id == account_id)
        ).scalar_one()
        assert persisted.version == 1
