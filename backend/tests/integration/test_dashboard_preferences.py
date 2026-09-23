"""Account+Space isolation and persistence tests for Dashboard preferences.

Covers the shared #817/#848 Account+Space Dashboard-module preference seam:
#817 visibility for every registered module, and #848's item-limit facet on
`upcoming` only.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.collections.models import Collection, CollectionPayload
from eimir.dashboard.models import DashboardModulePreference
from eimir.dashboard.preferences import CATALOG, DashboardModuleKey
from eimir.plans.models import Plan, PlanPayload, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ALL_MODULE_KEYS = [definition.key.value for definition in CATALOG]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    second_anna_space = make_space(session, anna)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "second_anna_space": second_anna_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def _preferences(client, space_id, token):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{space_id}/dashboard/preferences",
        headers=auth(token),
    )


def _patch(client, space_id, token, module_key, body):  # type: ignore[no-untyped-def]
    return client.patch(
        f"/api/v1/spaces/{space_id}/dashboard/preferences/{module_key}",
        json=body,
        headers=auth(token),
    )


def _set_limit(client, space_id, token, item_limit):  # type: ignore[no-untyped-def]
    return _patch(
        client,
        space_id,
        token,
        DashboardModuleKey.UPCOMING.value,
        {"itemLimit": item_limit},
    )


def _set_visible(client, space_id, token, module_key, visible):  # type: ignore[no-untyped-def]
    return _patch(client, space_id, token, module_key, {"visible": visible})


def _reorder(client, space_id, token, keys):  # type: ignore[no-untyped-def]
    return client.put(
        f"/api/v1/spaces/{space_id}/dashboard/preferences/order",
        json={"moduleKeys": keys},
        headers=auth(token),
    )


def _item(response_json, module_key):  # type: ignore[no-untyped-def]
    return next(item for item in response_json["items"] if item["moduleKey"] == module_key)


# --- A) Catalog -------------------------------------------------------------


def test_catalog_keys_are_stable_and_unique() -> None:
    keys = [definition.key.value for definition in CATALOG]
    assert keys == [
        "relationship_presence",
        "keepsake",
        "upcoming",
        "pinned_collection",
        "relationship_signal",
        "monthly_highlights",
        "recent_shared",
        "shared_story_summary",
    ]
    assert len(keys) == len(set(keys))


def test_only_upcoming_defines_an_item_limit_facet() -> None:
    for definition in CATALOG:
        if definition.key is DashboardModuleKey.UPCOMING:
            assert definition.item_limit is not None
        else:
            assert definition.item_limit is None


def test_every_module_defaults_visible() -> None:
    assert all(definition.default_visible for definition in CATALOG)


def test_reorder_persists_full_order_without_losing_visibility_or_other_facets(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    space_id = couple["space"].id
    token = couple["token_a"]
    assert _set_visible(client, space_id, token, "keepsake", False).status_code == 200
    assert _set_limit(client, space_id, token, 3).status_code == 200
    desired = [ALL_MODULE_KEYS[-1], *ALL_MODULE_KEYS[:-1]]

    response = _reorder(client, space_id, token, desired)
    assert response.status_code == 200, response.text
    assert [item["moduleKey"] for item in response.json()["items"]] == desired
    assert _item(response.json(), "keepsake")["visible"] is False
    assert _item(response.json(), "upcoming")["itemLimit"] == 3

    # A visibility PATCH changes only that facet; a hidden row keeps its slot.
    assert _set_visible(client, space_id, token, "keepsake", True).status_code == 200
    session.expire_all()
    reloaded = _preferences(client, space_id, token)
    assert [item["moduleKey"] for item in reloaded.json()["items"]] == desired
    assert _item(reloaded.json(), "keepsake")["visible"] is True

    # Neither partner nor another Space receives this person's order.
    for other_space, other_token in [
        (space_id, couple["token_b"]),
        (couple["second_anna_space"].id, token),
    ]:
        other = _preferences(client, other_space, other_token)
        assert other.status_code == 200
        assert [item["moduleKey"] for item in other.json()["items"]] == ALL_MODULE_KEYS


def test_reorder_rejects_partial_duplicate_and_foreign_keys_atomically(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    space_id = couple["space"].id
    token = couple["token_a"]
    for invalid in [
        ALL_MODULE_KEYS[:-1],
        [ALL_MODULE_KEYS[0]] * len(ALL_MODULE_KEYS),
        [*ALL_MODULE_KEYS[:-1], "not-a-module"],
    ]:
        result = _reorder(client, space_id, token, invalid)
        assert result.status_code == 422
        assert result.json()["code"] == "DASHBOARD_MODULE_INVALID_ORDER"
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0

    denied = _reorder(client, couple["foreign_space"].id, token, ALL_MODULE_KEYS)
    assert denied.status_code == 404


def test_only_pinned_collection_supports_collection_selection() -> None:
    for definition in CATALOG:
        assert definition.selects_collection is (
            definition.key is DashboardModuleKey.PINNED_COLLECTION
        )


# --- B) Inventory completeness -----------------------------------------------


def test_missing_override_returns_effective_default_for_every_registered_module(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    response = _preferences(client, couple["space"].id, couple["token_a"])

    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "items": [
            {"moduleKey": "relationship_presence", "visible": True},
            {"moduleKey": "keepsake", "visible": True},
            {"moduleKey": "upcoming", "visible": True, "itemLimit": 1},
            {"moduleKey": "pinned_collection", "visible": True},
            {"moduleKey": "relationship_signal", "visible": True},
            {"moduleKey": "monthly_highlights", "visible": True},
            {"moduleKey": "recent_shared", "visible": True},
            {"moduleKey": "shared_story_summary", "visible": True},
        ],
    }
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0


def test_unknown_module_is_rejected_and_fails_closed(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    response = _patch(
        client,
        couple["space"].id,
        couple["token_a"],
        "not-a-module",
        {"visible": False},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "DASHBOARD_MODULE_NOT_FOUND"
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0


@pytest.mark.parametrize(
    "module_key",
    [
        "relationship_presence",
        "pinned_collection",
        "keepsake",
        "relationship_signal",
        "monthly_highlights",
        "recent_shared",
        "shared_story_summary",
    ],
)
def test_item_limit_is_rejected_on_modules_that_do_not_support_it(
    client,
    session: Session,
    couple,
    module_key: str,
) -> None:  # type: ignore[no-untyped-def]
    response = _patch(client, couple["space"].id, couple["token_a"], module_key, {"itemLimit": 2})

    assert response.status_code == 422
    assert response.json()["code"] == "DASHBOARD_MODULE_FACET_NOT_SUPPORTED"
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0


def _make_collection(session: Session, *, space, owner, title: str) -> Collection:  # type: ignore[no-untyped-def]
    collection = Collection(
        space_id=space.id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=CollectionPayload(title=title),
    )
    session.add(collection)
    session.flush()
    return collection


def test_pinned_collection_selection_persists_per_account_and_can_be_cleared(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    collection = _make_collection(
        session,
        space=couple["space"],
        owner=couple["anna"],
        title="Einkauf",
    )

    pinned = _patch(
        client,
        couple["space"].id,
        couple["token_a"],
        DashboardModuleKey.PINNED_COLLECTION.value,
        {"selectedCollectionId": str(collection.id)},
    )
    assert pinned.status_code == 200, pinned.text
    assert pinned.json() == {
        "moduleKey": "pinned_collection",
        "visible": True,
        "selectedCollectionId": str(collection.id),
    }

    # The choice is personal even though the Collection itself is shared.
    ben = _preferences(client, couple["space"].id, couple["token_b"])
    assert "selectedCollectionId" not in _item(ben.json(), "pinned_collection")

    cleared = _patch(
        client,
        couple["space"].id,
        couple["token_a"],
        DashboardModuleKey.PINNED_COLLECTION.value,
        {"selectedCollectionId": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert "selectedCollectionId" not in cleared.json()


def test_pinned_collection_rejects_foreign_resource_without_changing_selection(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    own_collection = _make_collection(
        session,
        space=couple["space"],
        owner=couple["anna"],
        title="Einkauf",
    )
    foreign_collection = _make_collection(
        session,
        space=couple["foreign_space"],
        owner=couple["outsider"],
        title="Foreign",
    )
    assert (
        _patch(
            client,
            couple["space"].id,
            couple["token_a"],
            DashboardModuleKey.PINNED_COLLECTION.value,
            {"selectedCollectionId": str(own_collection.id)},
        ).status_code
        == 200
    )

    denied = _patch(
        client,
        couple["space"].id,
        couple["token_a"],
        DashboardModuleKey.PINNED_COLLECTION.value,
        {"selectedCollectionId": str(foreign_collection.id)},
    )
    assert denied.status_code == 404
    assert denied.json()["code"] == "COLLECTION_NOT_FOUND"

    reloaded = _preferences(client, couple["space"].id, couple["token_a"])
    assert _item(reloaded.json(), "pinned_collection")["selectedCollectionId"] == str(
        own_collection.id
    )


def test_selected_resource_facet_is_rejected_on_other_modules(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    collection = _make_collection(
        session,
        space=couple["space"],
        owner=couple["anna"],
        title="Einkauf",
    )
    response = _patch(
        client,
        couple["space"].id,
        couple["token_a"],
        DashboardModuleKey.KEEPSAKE.value,
        {"selectedCollectionId": str(collection.id)},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "DASHBOARD_MODULE_FACET_NOT_SUPPORTED"


def test_deleting_selected_collection_clears_the_personal_pin(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    collection = _make_collection(
        session,
        space=couple["space"],
        owner=couple["anna"],
        title="Einkauf",
    )
    assert (
        _patch(
            client,
            couple["space"].id,
            couple["token_a"],
            DashboardModuleKey.PINNED_COLLECTION.value,
            {"selectedCollectionId": str(collection.id)},
        ).status_code
        == 200
    )

    session.delete(collection)
    session.flush()
    session.expire_all()

    reloaded = _preferences(client, couple["space"].id, couple["token_a"])
    assert "selectedCollectionId" not in _item(reloaded.json(), "pinned_collection")


def test_empty_update_body_is_rejected(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    response = _patch(client, couple["space"].id, couple["token_a"], "keepsake", {})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0


# --- C) Persistence -----------------------------------------------------------


@pytest.mark.parametrize("item_limit", [1, 2, 3])
def test_each_allowed_limit_persists_and_reloads(
    client,
    session: Session,
    couple,
    item_limit: int,
) -> None:  # type: ignore[no-untyped-def]
    updated = _set_limit(client, couple["space"].id, couple["token_a"], item_limit)

    assert updated.status_code == 200, updated.text
    assert updated.headers["cache-control"] == "private, no-store"
    assert updated.json() == {
        "moduleKey": "upcoming",
        "visible": True,
        "itemLimit": item_limit,
    }
    session.expire_all()
    reloaded = _preferences(client, couple["space"].id, couple["token_a"])
    assert _item(reloaded.json(), "upcoming") == {
        "moduleKey": "upcoming",
        "visible": True,
        "itemLimit": item_limit,
    }


@pytest.mark.parametrize("item_limit", [0, 4, -1, 1.5, "many"])
def test_invalid_item_limits_are_rejected_without_persistence(
    client,
    session: Session,
    couple,
    item_limit: object,
) -> None:  # type: ignore[no-untyped-def]
    response = _set_limit(client, couple["space"].id, couple["token_a"], item_limit)

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0


def test_explicit_null_item_limit_fails_closed_without_persistence(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    # `itemLimit: null` passes the type check (the field is nullable so #817
    # visibility-only modules can omit it) but supplies no facet at all, so it
    # fails closed at the service boundary rather than the schema boundary.
    response = _set_limit(client, couple["space"].id, couple["token_a"], None)

    assert response.status_code == 422
    assert session.scalar(select(func.count()).select_from(DashboardModulePreference)) == 0


@pytest.mark.parametrize("module_key", ALL_MODULE_KEYS)
def test_hide_then_show_persists_and_reloads_for_every_module(
    client,
    session: Session,
    couple,
    module_key: str,
) -> None:  # type: ignore[no-untyped-def]
    hidden = _set_visible(client, couple["space"].id, couple["token_a"], module_key, False)
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["visible"] is False

    session.expire_all()
    reloaded_hidden = _preferences(client, couple["space"].id, couple["token_a"])
    assert _item(reloaded_hidden.json(), module_key)["visible"] is False

    shown = _set_visible(client, couple["space"].id, couple["token_a"], module_key, True)
    assert shown.status_code == 200, shown.text
    assert shown.json()["visible"] is True

    session.expire_all()
    reloaded_shown = _preferences(client, couple["space"].id, couple["token_a"])
    assert _item(reloaded_shown.json(), module_key)["visible"] is True


def test_setting_visible_does_not_disturb_an_existing_item_limit(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    assert _set_limit(client, couple["space"].id, couple["token_a"], 3).status_code == 200

    hidden = _set_visible(client, couple["space"].id, couple["token_a"], "upcoming", False)

    assert hidden.status_code == 200
    assert hidden.json() == {"moduleKey": "upcoming", "visible": False, "itemLimit": 3}


def test_setting_item_limit_does_not_disturb_an_existing_visibility_override(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    assert (
        _set_visible(client, couple["space"].id, couple["token_a"], "upcoming", False).status_code
        == 200
    )

    updated = _set_limit(client, couple["space"].id, couple["token_a"], 2)

    assert updated.status_code == 200
    assert updated.json() == {"moduleKey": "upcoming", "visible": False, "itemLimit": 2}


def test_preferences_are_independent_per_partner_and_space(
    client,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    assert _set_limit(client, couple["space"].id, couple["token_a"], 2).status_code == 200
    assert (
        _set_visible(client, couple["space"].id, couple["token_a"], "keepsake", False).status_code
        == 200
    )
    assert (
        _set_limit(
            client,
            couple["second_anna_space"].id,
            couple["token_a"],
            3,
        ).status_code
        == 200
    )

    anna_primary = _preferences(client, couple["space"].id, couple["token_a"]).json()
    ben_primary = _preferences(client, couple["space"].id, couple["token_b"]).json()
    anna_secondary = _preferences(client, couple["second_anna_space"].id, couple["token_a"]).json()

    assert _item(anna_primary, "upcoming")["itemLimit"] == 2
    assert _item(anna_primary, "keepsake")["visible"] is False

    # Partner A's choice does not affect Partner B, even in the same Space.
    assert _item(ben_primary, "upcoming")["itemLimit"] == 1
    assert _item(ben_primary, "keepsake")["visible"] is True

    # No cross-Space leakage for the same account.
    assert _item(anna_secondary, "upcoming")["itemLimit"] == 3
    assert _item(anna_secondary, "keepsake")["visible"] is True


def test_repeated_updates_upsert_one_row_per_module(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    first = _set_limit(client, couple["space"].id, couple["token_a"], 1)
    second = _set_limit(client, couple["space"].id, couple["token_a"], 3)
    third = _set_visible(client, couple["space"].id, couple["token_a"], "upcoming", False)

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 200
    rows = session.scalars(select(DashboardModulePreference)).all()
    assert len(rows) == 1
    assert rows[0].item_limit == 3
    assert rows[0].visible is False


def test_preference_update_does_not_mutate_dashboard_or_planning_data(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    plan = Plan(
        space_id=couple["space"].id,
        source_wish_id=None,
        status=PlanStatus.IDEA.value,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=PlanPayload(title="Shared plan"),
    )
    session.add(plan)
    session.flush()
    before = client.get(
        f"/api/v1/spaces/{couple['space'].id}/dashboard",
        headers=auth(couple["token_a"]),
    ).json()

    updated = _set_visible(client, couple["space"].id, couple["token_a"], "recent_shared", False)
    after = client.get(
        f"/api/v1/spaces/{couple['space'].id}/dashboard",
        headers=auth(couple["token_a"]),
    ).json()

    assert updated.status_code == 200
    assert after == before
    session.refresh(plan)
    assert plan.payload.title == "Shared plan"


# --- D) Authorization -----------------------------------------------------------


def test_membership_guard_hides_preferences_from_outsiders(
    client,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    denied_read = _preferences(client, couple["space"].id, couple["token_outsider"])
    denied_write = _set_visible(
        client, couple["space"].id, couple["token_outsider"], "keepsake", False
    )

    assert denied_read.status_code == 404
    assert denied_write.status_code == 404


def test_foreign_space_is_denied_even_with_a_valid_session(
    client,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    denied_read = _preferences(client, couple["foreign_space"].id, couple["token_a"])
    denied_write = _set_visible(
        client, couple["foreign_space"].id, couple["token_a"], "keepsake", False
    )

    assert denied_read.status_code == 404
    assert denied_write.status_code == 404


def test_former_member_is_denied_after_offboarding(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    assert (
        _set_visible(client, couple["space"].id, couple["token_b"], "keepsake", False).status_code
        == 200
    )

    membership = session.execute(
        select(Membership).where(
            Membership.space_id == couple["space"].id,
            Membership.account_id == couple["ben"].id,
        )
    ).scalar_one()
    membership.status = MembershipStatus.REMOVED.value
    session.flush()

    denied_read = _preferences(client, couple["space"].id, couple["token_b"])
    denied_write = _set_visible(client, couple["space"].id, couple["token_b"], "keepsake", True)

    assert denied_read.status_code == 404
    assert denied_write.status_code == 404
