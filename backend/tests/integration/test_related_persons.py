"""HTTP matrix for RelatedPerson and ImportantDate."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.people.models import PersonRelationship
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
    note: str | None = None,
) -> dict[str, Any]:
    return {
        "displayName": display_name,
        "relationship": relationship,
        "birthday": birthday,
        "birthdayYearKnown": birthday_year_known,
        "visibility": visibility,
        "showBirthdayOnDashboard": show_birthday_on_dashboard,
        **({"note": note} if note is not None else {}),
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

    def test_private_person_request_is_rejected_without_creating_content(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        response = create_person(client, couple, visibility="PRIVATE")
        assert response.status_code == 422
        for token in ("token_a", "token_b"):
            listing = client.get(persons_path(couple["space"].id), headers=auth(couple[token]))
            assert listing.status_code == 200
            assert listing.json() == []

    def test_partner_can_modify_shared_person(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = client.put(
            f"{persons_path(couple['space'].id)}/{person['id']}",
            json=person_body(display_name="Umbenannt"),
            headers=if_match(couple["token_b"], person["version"]),
        )
        assert response.status_code == 200
        assert response.json()["displayName"] == "Umbenannt"
        assert response.json()["visibility"] == "SHARED"

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
        response = create_person(client, couple, relationship="UNKNOWN_RELATIONSHIP")
        assert response.status_code == 422

    @pytest.mark.parametrize("relationship", list(PersonRelationship))
    def test_concrete_and_legacy_relationships_are_persisted(
        self, client, couple, relationship
    ) -> None:  # type: ignore[no-untyped-def]
        response = create_person(client, couple, relationship=relationship.value)
        assert response.status_code == 201
        path = f"{persons_path(couple['space'].id)}/{response.json()['id']}"
        assert (
            client.get(path, headers=auth(couple["token_b"])).json()["relationship"] == relationship
        )

    def test_shared_note_survives_legacy_writes_and_obeys_authorization_and_versions(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        note = "Likes the sea.\nRemember the strawberry cake."
        response = create_person(client, couple, note=f"  {note}  ")
        assert response.status_code == 201
        person = response.json()
        path = f"{persons_path(couple['space'].id)}/{person['id']}"
        assert person["note"] == note
        assert client.get(path, headers=auth(couple["token_b"])).json()["note"] == note
        for method in ("get", "put"):
            arguments = {"headers": if_match(couple["token_outsider"], person["version"])}
            if method == "put":
                arguments["json"] = person_body(note="Not authorized")
            assert getattr(client, method)(path, **arguments).status_code == 404

        # Pre-note clients omit the new field; explicit null has the same contract.
        for supplied in ({}, {"note": None}):
            response = client.put(
                path,
                json={**person_body(display_name="Renamed"), **supplied},
                headers=if_match(couple["token_b"], person["version"]),
            )
            assert response.status_code == 200
            person = response.json()
            assert person["note"] == note

        changed = client.put(
            path,
            json=person_body(note="A new note"),
            headers=if_match(couple["token_b"], person["version"]),
        )
        assert changed.status_code == 200
        stale = client.put(
            path,
            json=person_body(note="Stale"),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert stale.status_code == 409
        assert client.get(path, headers=auth(couple["token_a"])).json()["note"] == "A new note"
        cleared = client.put(
            path,
            json=person_body(note=""),
            headers=if_match(couple["token_a"], changed.json()["version"]),
        )
        assert cleared.status_code == 200
        assert cleared.json()["note"] == ""

    def test_note_is_bounded_and_optional(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        assert create_person(client, couple).json()["note"] == ""
        assert create_person(client, couple, note="n" * 2000).status_code == 201
        assert create_person(client, couple, note="n" * 2001).status_code == 422

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

    def test_persists_as_shared_without_an_audience_argument(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        body = person_body(show_birthday_on_dashboard=True)
        del body["visibility"]
        response = client.post(
            persons_path(couple["space"].id), json=body, headers=auth(couple["token_a"])
        )
        assert response.status_code == 201
        assert response.json()["visibility"] == "SHARED"
        assert response.json()["showBirthdayOnDashboard"] is True


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

    def test_filter_by_foreign_person_remains_404(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            persons_path(couple["outsider_space"].id),
            json=person_body(),
            headers=auth(couple["token_outsider"]),
        )
        person = response.json()
        filtered = client.get(
            f"{dates_path(couple['space'].id)}?relatedPersonId={person['id']}",
            headers=auth(couple["token_a"]),
        )
        assert filtered.status_code == 404
        assert filtered.json()["code"] == "RELATED_PERSON_NOT_FOUND"

    def test_unknown_type_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        assert create_date(client, couple, date_type="FUNERAL").status_code == 422

    def test_unknown_recurrence_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        assert create_date(client, couple, repeats="WEEKLY").status_code == 422


class TestSharedPeopleAndIndependentDatePrivacy:
    def test_shared_date_can_reference_a_shared_person(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = create_date(client, couple, related_person_id=person["id"])
        assert response.status_code == 201
        assert response.json()["relatedPersonId"] == person["id"]

    def test_private_date_keeps_its_scope_on_a_shared_person(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        response = create_date(client, couple, related_person_id=person["id"], visibility="PRIVATE")
        assert response.status_code == 201
        private = response.json()
        assert (
            client.get(
                f"{dates_path(couple['space'].id)}/{private['id']}", headers=auth(couple["token_b"])
            ).status_code
            == 404
        )
        assert (
            client.get(
                f"{dates_path(couple['space'].id)}?relatedPersonId={person['id']}",
                headers=auth(couple["token_b"]),
            ).json()
            == []
        )

    def test_partner_cannot_open_another_members_private_date(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        person = create_person(client, couple).json()
        private = create_date(
            client, couple, related_person_id=person["id"], visibility="PRIVATE"
        ).json()
        response = client.put(
            f"{dates_path(couple['space'].id)}/{private['id']}",
            json=date_body(related_person_id=person["id"]),
            headers=if_match(couple["token_b"], private["version"]),
        )
        assert response.status_code == 404

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
        assert response.status_code == 422

    def test_partners_private_date_does_not_block_shared_edit(
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
            json=person_body(display_name="Lisa Marie"),
            headers=if_match(couple["token_a"], person["version"]),
        )
        assert response.status_code == 200
        assert response.json()["visibility"] == "SHARED"

    def test_database_enforces_shared_people_without_domain_logic(self, session, couple) -> None:  # type: ignore[no-untyped-def]
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
        with pytest.raises(IntegrityError, match="people_are_shared"), session.begin_nested():
            session.add(person)
            session.flush()

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
