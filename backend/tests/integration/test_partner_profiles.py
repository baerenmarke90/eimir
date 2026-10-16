"""HTTP matrix for PartnerProfile and ProfilePreference."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def preference_body(
    account_id: object,
    *,
    visibility: str = "SELF_PROFILE",
    category: str = "DRINK",
    topic: str = "favorite_drink",
    sentiment: str = "LOVE",
    value: str = "Coca Cola Zero",
) -> dict[str, Any]:
    return {
        "accountId": str(account_id),
        "visibility": visibility,
        "category": category,
        "topic": topic,
        "sentiment": sentiment,
        "value": value,
    }


def preferences_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/profile-preferences"


def profile_path(space_id: object, account_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/profiles/{account_id}"


def nickname_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/partner-nickname"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremd")

    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    session.flush()

    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "outsider_space": outsider_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def create_preference(
    client,
    couple,
    *,
    token_key: str = "token_a",
    **overrides,
):  # type: ignore[no-untyped-def]
    request_body = preference_body(couple["anna"].id)
    request_body.update(overrides)
    return client.post(
        preferences_path(couple["space"].id),
        json=request_body,
        headers=auth(couple[token_key]),
    )


class TestPartnerProfile:
    def test_membership_creates_uuidv7_profile(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            profile_path(couple["space"].id, couple["ben"].id),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["accountId"] == str(couple["ben"].id)
        assert body["displayName"] == "Ben"
        assert body["preferences"] == []
        assert UUID(body["id"]).version == 7

    def test_partner_sees_self_profile_preference(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_preference(client, couple)
        assert created.status_code == 201

        response = client.get(
            profile_path(couple["space"].id, couple["anna"].id),
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 200
        assert [item["value"] for item in response.json()["preferences"]] == ["Coca Cola Zero"]

    def test_private_partner_note_never_appears_in_partner_profile(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_preference(
            client,
            couple,
            accountId=str(couple["ben"].id),
            visibility="PRIVATE_PARTNER_NOTE",
            category="OTHER",
            topic="surprise",
            sentiment="LIKE",
            value="Ueberraschung planen",
        )
        assert created.status_code == 201

        response = client.get(
            profile_path(couple["space"].id, couple["ben"].id),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 200
        assert response.json()["preferences"] == []

    def test_cross_tenant_profile_remains_404(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            profile_path(couple["space"].id, couple["outsider"].id),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PARTNER_PROFILE_NOT_FOUND"


class TestPartnerNickname:
    def test_private_per_viewer_label_and_versioned_remove(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        path = nickname_path(couple["space"].id)
        initial = client.get(path, headers=auth(couple["token_a"]))
        assert initial.status_code == 200
        assert initial.json() == {
            "partnerId": str(couple["ben"].id),
            "nickname": None,
            "version": 0,
        }
        assert initial.headers["etag"] == '"0"'

        saved = client.put(
            path,
            json={"nickname": "  Lieblingsmensch  "},
            headers={**auth(couple["token_a"]), "If-Match": '"0"'},
        )
        assert saved.status_code == 200
        assert saved.json()["nickname"] == "Lieblingsmensch"
        assert saved.json()["version"] == 1
        owner_view = client.get(path, headers=auth(couple["token_a"]))
        assert owner_view.json()["nickname"] == "Lieblingsmensch"
        assert client.get(path, headers=auth(couple["token_b"])).json()["nickname"] is None
        partner_profile = client.get(
            profile_path(couple["space"].id, couple["ben"].id),
            headers=auth(couple["token_a"]),
        )
        assert partner_profile.json()["displayName"] == "Ben"

        stale = client.put(
            path,
            json={"nickname": "Stern"},
            headers={**auth(couple["token_a"]), "If-Match": '"0"'},
        )
        assert stale.status_code == 409
        removed = client.put(
            path,
            json={"nickname": None},
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert removed.status_code == 200
        assert removed.json()["nickname"] is None
        assert removed.json()["version"] == 2

    def test_rejects_outsider_and_blank_label(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        path = nickname_path(couple["space"].id)
        outsider = client.get(path, headers=auth(couple["token_outsider"]))
        assert outsider.status_code == 404
        blank = client.put(
            path,
            json={"nickname": "   "},
            headers={**auth(couple["token_a"]), "If-Match": '"0"'},
        )
        assert blank.status_code == 422


class TestPreferencePrivacy:
    def test_partner_cannot_write_foreign_self_profile(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            preferences_path(couple["space"].id),
            json=preference_body(couple["anna"].id),
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 403
        assert response.json()["code"] == "PROFILE_SELF_WRITE_ONLY"

    def test_private_note_is_invisible_to_target_partner(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = client.post(
            preferences_path(couple["space"].id),
            json=preference_body(
                couple["ben"].id,
                visibility="PRIVATE_PARTNER_NOTE",
                category="OTHER",
                topic="gift",
                sentiment="LOVE",
                value="Geheime Geschenkidee",
            ),
            headers=auth(couple["token_a"]),
        )
        assert created.status_code == 201
        preference_id = created.json()["id"]

        owner_list = client.get(
            preferences_path(couple["space"].id),
            headers=auth(couple["token_a"]),
        )
        partner_list = client.get(
            preferences_path(couple["space"].id),
            headers=auth(couple["token_b"]),
        )
        assert [item["id"] for item in owner_list.json()] == [preference_id]
        assert partner_list.json() == []

        direct = client.get(
            f"{preferences_path(couple['space'].id)}/{preference_id}",
            headers=auth(couple["token_b"]),
        )
        assert direct.status_code == 404
        assert direct.json()["code"] == "PROFILE_PREFERENCE_NOT_FOUND"

    def test_cross_tenant_preference_is_404(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_preference(client, couple)
        preference_id = created.json()["id"]
        response = client.get(
            f"/api/v1/spaces/{couple['outsider_space'].id}/profile-preferences/{preference_id}",
            headers=auth(couple["token_outsider"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PROFILE_PREFERENCE_NOT_FOUND"

    def test_shared_preference_is_read_only_for_partner(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_preference(client, couple)
        preference_id = created.json()["id"]
        response = client.put(
            f"{preferences_path(couple['space'].id)}/{preference_id}",
            json={
                "category": "DRINK",
                "topic": "favorite_drink",
                "sentiment": "LIKE",
                "value": "Wasser",
            },
            headers={**auth(couple["token_b"]), "If-Match": '"1"'},
        )
        assert response.status_code == 403
        assert response.json()["code"] == "NOT_RESOURCE_OWNER"

    def test_malformed_and_invisible_share_same_404_class(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            f"{preferences_path(couple['space'].id)}/keine-uuid",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PROFILE_PREFERENCE_NOT_FOUND"


class TestPreferenceConcurrencyAndValidation:
    def test_update_requires_current_version(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_preference(client, couple)
        preference_id = created.json()["id"]
        item_path = f"{preferences_path(couple['space'].id)}/{preference_id}"
        update_body = {
            "category": "DRINK",
            "topic": "favorite_drink",
            "sentiment": "LIKE",
            "value": "Mineralwasser",
        }

        updated = client.put(
            item_path,
            json=update_body,
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert updated.status_code == 200
        assert updated.json()["version"] == 2
        assert updated.headers["ETag"] == '"2"'

        stale = client.put(
            item_path,
            json=update_body,
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "VERSION_CONFLICT"

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("category", "UNKNOWN"),
            ("sentiment", "OBSESSED"),
            ("visibility", "PUBLIC"),
        ],
    )
    def test_unknown_enums_are_rejected(
        self,
        client,
        couple,
        field: str,
        value: str,
    ) -> None:  # type: ignore[no-untyped-def]
        request_body = preference_body(couple["anna"].id)
        request_body[field] = value
        response = client.post(
            preferences_path(couple["space"].id),
            json=request_body,
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422
        assert set(response.json()) == {"type", "title", "status", "detail", "code"}

    def test_private_note_about_self_is_rejected(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            preferences_path(couple["space"].id),
            json=preference_body(
                couple["anna"].id,
                visibility="PRIVATE_PARTNER_NOTE",
            ),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PROFILE_PARTNER_NOTE_TARGET_REQUIRED"

    def test_anonymous_remains_401(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.get(preferences_path(couple["space"].id))
        assert response.status_code == 401
        assert response.json()["code"] == "AUTHENTICATION_REQUIRED"
