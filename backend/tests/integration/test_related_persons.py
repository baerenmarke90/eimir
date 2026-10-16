"""HTTP matrix for RelatedPerson and ImportantDate."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def persons_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/related-persons"


def dates_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/important-dates"


def person_body(
    *,
    display_name: str = "Lisa",
    relationship: str = "CHILD",
    birthday: str | None = "2016-02-29",
    birthday_year_known: bool = True,
    visibility: str = "SHARED",
    show_birthday_on_dashboard: bool = False,
) -> dict[str, Any]:
    return {
        "displayName": display_name,
        "relationship": relationship,
        "birthday": birthday,
        "birthdayYearKnown": birthday_year_known,
        "visibility": visibility,
        "showBirthdayOnDashboard": show_birthday_on_dashboard,
    }


def date_body(
    *,
    label: str = "Lisas Geburtstag",
    date_type: str = "BIRTHDAY",
    day: str = "2016-02-29",
    repeats: str = "ANNUALLY",
    visibility: str = "SHARED",
    related_person_id: object | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "label": label,
        "type": date_type,
        "date": day,
        "repeats": repeats,
        "visibility": visibility,
    }
    if related_person_id is not None:
        body["relatedPersonId"] = str(related_person_id)
    return body


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


def create_person(
    client,
    couple,
    *,
    token_key: str = "token_a",
    **overrides,
):  # type: ignore[no-untyped-def]
    return client.post(
        persons_path(couple["space"].id),
        json=person_body(**overrides),
        headers=auth(couple[token_key]),
    )


def create_date(
    client,
    couple,
    *,
    token_key: str = "token_a",
    **overrides,
):  # type: ignore[no-untyped-def]
    return client.post(
        dates_path(couple["space"].id),
        json=date_body(**overrides),
        headers=auth(couple[token_key]),
    )


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


class TestRelatedPerson:
    def test_create_returns_uuidv7_and_etag(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(client, couple)
        assert response.status_code == 201
        body = response.json()
        assert UUID(body["id"]).version == 7
        assert body["displayName"] == "Lisa"
        assert body["relationship"] == "CHILD"
        assert body["visibility"] == "SHARED"
        assert response.headers["ETag"] == '"1"'

    def test_partner_sees_shared_person(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = client.get(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 200
        assert response.json()["displayName"] == "Lisa"

    def test_private_person_remains_invisible_to_partner(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple, visibility="PRIVATE").json()

        detail = client.get(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            headers=auth(couple["token_b"]),
        )
        assert detail.status_code == 404
        assert detail.json()["code"] == "RELATED_PERSON_NOT_FOUND"

        listing = client.get(
            persons_path(couple["space"].id),
            headers=auth(couple["token_b"]),
        )
        assert listing.status_code == 200
        assert listing.json() == []

    def test_partner_cannot_modify_shared_person(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(display_name="Umbenannt"),
            headers=if_match(couple["token_b"], person["version"]),
        )
        assert response.status_code == 403
        assert response.json()["code"] == "NOT_RESOURCE_OWNER"

    def test_stale_state_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        first = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(display_name="Lisa Marie"),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert first.status_code == 200

        second = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(display_name="Noch mal anders"),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert second.status_code == 409
        assert second.json()["code"] == "VERSION_CONFLICT"

    def test_foreign_space_remains_404(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = client.get(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            headers=auth(couple["token_outsider"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_anonymous_remains_401(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.get(persons_path(couple["space"].id))
        assert response.status_code == 401
        assert response.json()["code"] == "AUTHENTICATION_REQUIRED"

    def test_unknown_relationship_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(client, couple, relationship="COLLEAGUE")
        assert response.status_code == 422

    def test_blank_display_name_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(client, couple, display_name="   ")
        assert response.status_code == 422


class TestBirthdayWithoutYear:
    def test_unknown_year_is_normalized(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(
            client,
            couple,
            birthday="2016-02-29",
            birthday_year_known=False,
        )
        assert response.status_code == 201
        body = response.json()
        assert body["birthday"] == "1904-02-29"
        assert body["birthdayYearKnown"] is False

    def test_known_year_is_preserved(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        body = create_person(client, couple, birthday="2016-02-29").json()
        assert body["birthday"] == "2016-02-29"
        assert body["birthdayYearKnown"] is True

    def test_known_year_without_date_is_contradiction(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(
            client,
            couple,
            birthday=None,
            birthday_year_known=True,
        )
        assert response.status_code == 422
        assert response.json()["code"] == "RELATED_PERSON_BIRTHDAY_REQUIRED"

    def test_missing_birthday_is_allowed(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(
            client,
            couple,
            birthday=None,
            birthday_year_known=False,
        )
        assert response.status_code == 201
        assert response.json()["birthday"] is None


class TestDashboardBirthdayVisibility:
    """#699 Finding 1: explicit opt-in for a birthday to appear on `/today`."""

    def test_omitted_field_defaults_to_false(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        """A request that never mentions the field still gets the safe default."""
        body = person_body()
        del body["showBirthdayOnDashboard"]
        response = client.post(
            persons_path(couple["space"].id),
            json=body,
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 201
        assert response.json()["showBirthdayOnDashboard"] is False

    def test_can_be_enabled_when_birthday_present(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(client, couple, show_birthday_on_dashboard=True)
        assert response.status_code == 201
        assert response.json()["showBirthdayOnDashboard"] is True

    def test_requires_a_birthday(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_person(
            client,
            couple,
            birthday=None,
            birthday_year_known=False,
            show_birthday_on_dashboard=True,
        )
        assert response.status_code == 422
        assert response.json()["code"] == "RELATED_PERSON_DASHBOARD_VISIBILITY_NEEDS_A_BIRTHDAY"

    def test_toggles_independently_on_update(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple, show_birthday_on_dashboard=False).json()

        enabled = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(show_birthday_on_dashboard=True),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert enabled.status_code == 200
        assert enabled.json()["showBirthdayOnDashboard"] is True

        disabled = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(show_birthday_on_dashboard=False),
            headers=if_match(couple["token_a"], enabled.json()["version"]),
        )
        assert disabled.status_code == 200
        assert disabled.json()["showBirthdayOnDashboard"] is False

    def test_persists_independent_of_visibility(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        """Writing the flag is not gated by SPACE_SHARED; only projection is."""
        response = create_person(
            client,
            couple,
            visibility="PRIVATE",
            show_birthday_on_dashboard=True,
        )
        assert response.status_code == 201
        body = response.json()
        assert body["visibility"] == "PRIVATE"
        assert body["showBirthdayOnDashboard"] is True


class TestImportantDate:
    def test_date_without_person_is_allowed(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_date(
            client,
            couple,
            label="Unser Jahrestag",
            date_type="ANNIVERSARY",
            day="2020-06-13",
        )
        assert response.status_code == 201
        assert response.json()["relatedPersonId"] is None

    def test_date_is_linked_to_person(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = create_date(client, couple, related_person_id=person["id"])
        assert response.status_code == 201
        assert response.json()["relatedPersonId"] == person["id"]

        filtered = client.get(
            f"{dates_path(couple['space'].id)}?relatedPersonId={person['id']}",
            headers=auth(couple["token_b"]),
        )
        assert filtered.status_code == 200
        assert [entry["id"] for entry in filtered.json()] == [response.json()["id"]]

    def test_person_from_foreign_space_remains_404(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        foreign_person = client.post(
            persons_path(couple["outsider_space"].id),
            json=person_body(display_name="Fremdes Kind"),
            headers=auth(couple["token_outsider"]),
        ).json()

        response = create_date(client, couple, related_person_id=foreign_person["id"])
        assert response.status_code == 404
        assert response.json()["code"] == "RELATED_PERSON_NOT_FOUND"

    def test_unknown_person_remains_404(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_date(client, couple, related_person_id=uuid4())
        assert response.status_code == 404
        assert response.json()["code"] == "RELATED_PERSON_NOT_FOUND"

    def test_private_date_remains_invisible_to_partner(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_date(client, couple, visibility="PRIVATE").json()

        detail = client.get(
            f"{dates_path(couple['space'].id)}/{created['id']}",
            headers=auth(couple["token_b"]),
        )
        assert detail.status_code == 404
        assert detail.json()["code"] == "IMPORTANT_DATE_NOT_FOUND"

        listing = client.get(
            dates_path(couple["space"].id),
            headers=auth(couple["token_b"]),
        )
        assert listing.json() == []

    def test_filter_by_partners_private_person_remains_404(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """Even a hit count of zero would disclose information about the person."""
        person = create_person(client, couple, visibility="PRIVATE").json()
        response = client.get(
            f"{dates_path(couple['space'].id)}?relatedPersonId={person['id']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "RELATED_PERSON_NOT_FOUND"

    def test_unknown_type_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        assert create_date(client, couple, date_type="FUNERAL").status_code == 422

    def test_unknown_recurrence_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        assert create_date(client, couple, repeats="WEEKLY").status_code == 422


class TestDateNeverMoreVisibleThanPerson:
    def test_shared_date_on_private_person_is_rejected(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple, visibility="PRIVATE").json()
        response = create_date(
            client,
            couple,
            related_person_id=person["id"],
            visibility="SHARED",
        )
        assert response.status_code == 422
        assert response.json()["code"] == "IMPORTANT_DATE_MORE_OPEN_THAN_PERSON"

    def test_private_date_on_private_person_is_allowed(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple, visibility="PRIVATE").json()
        response = create_date(
            client,
            couple,
            related_person_id=person["id"],
            visibility="PRIVATE",
        )
        assert response.status_code == 201

    def test_opening_date_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple, visibility="PRIVATE").json()
        important_date = create_date(
            client,
            couple,
            related_person_id=person["id"],
            visibility="PRIVATE",
        ).json()

        response = client.put(
            f"{dates_path(couple['space'].id)}/{important_date['id']}",
            json=date_body(related_person_id=person["id"], visibility="SHARED"),
            headers=if_match(couple["token_a"], important_date["version"]),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "IMPORTANT_DATE_MORE_OPEN_THAN_PERSON"

    def test_person_with_shared_dates_does_not_silently_become_private(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        create_date(client, couple, related_person_id=person["id"], visibility="SHARED")

        response = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(visibility="PRIVATE"),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "RELATED_PERSON_HAS_SHARED_DATES"

    def test_partners_private_date_does_not_block_restriction(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        create_date(
            client,
            couple,
            token_key="token_b",
            related_person_id=person["id"],
            visibility="PRIVATE",
        )

        response = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(visibility="PRIVATE"),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert response.status_code == 200
        assert response.json()["visibility"] == "PRIVATE"

    def test_database_enforces_rule_without_domain_logic(
        self,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """The rule is a schema fact, not only a service validation."""
        from eimir.core.ids import new_id
        from eimir.people.models import RelatedPerson, RelatedPersonPayload

        person = RelatedPerson(
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            privacy_class="OWNER_ONLY",
            relationship="CHILD",
            birthday=None,
            birthday_year_known=False,
            payload=RelatedPersonPayload(display_name="Lisa"),
        )
        session.add(person)
        session.flush()

        with pytest.raises(IntegrityError) as error:
            session.execute(
                text(
                    "INSERT INTO important_dates (id, space_id, owner_id, privacy_class, "
                    "related_person_id, related_person_privacy_class, type, date, repeats, "
                    "crypto_version, payload, version) "
                    "VALUES (:id, :space_id, :owner_id, 'SPACE_SHARED', :person_id, "
                    "'OWNER_ONLY', 'BIRTHDAY', :day, 'ANNUALLY', 0, '{\"label\": \"x\"}', 1)"
                ),
                {
                    "id": new_id(),
                    "space_id": couple["space"].id,
                    "owner_id": couple["anna"].id,
                    "person_id": person.id,
                    "day": date(2016, 2, 29),
                },
            )
        assert "never_more_open_than_its_person" in str(error.value)
        session.rollback()

    def test_deleted_person_cascades_to_its_dates(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        own = create_date(client, couple, related_person_id=person["id"]).json()
        partner = create_date(
            client,
            couple,
            token_key="token_b",
            related_person_id=person["id"],
            visibility="PRIVATE",
            label="Meine Notiz",
        ).json()

        deleted = client.delete(
            f"{persons_path(couple['space'].id)}/{person['id']}?deletePolicy=cascade",
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert deleted.status_code == 204

        assert (
            client.get(
                f"{dates_path(couple['space'].id)}/{own['id']}",
                headers=auth(couple["token_a"]),
            ).status_code
            == 404
        )
        assert (
            client.get(
                f"{dates_path(couple['space'].id)}/{partner['id']}",
                headers=auth(couple["token_b"]),
            ).status_code
            == 404
        )
