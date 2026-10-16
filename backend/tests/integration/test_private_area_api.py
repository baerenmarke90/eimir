"""PostgreSQL/HTTP acceptance coverage for M3-S7 owner-only private content."""

from __future__ import annotations

import socket
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_NOTE_TITLE = "Private surprise planning"
SECRET_NOTE_BODY = "Do not reveal this body"
SECRET_GIFT_TITLE = "Private gift title"
SECRET_GIFT_URL = "http://169.254.169.254/latest/meta-data/"


def note_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/private/notes"


def gift_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/private/gift-ideas"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Foreign")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, foreign)
    relationship_service.add_member(session, foreign_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "foreign": foreign,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "foreign_token": sign_in(session, foreign),
    }


def create_note(client, couple, *, token_key: str = "token_a", title: str = SECRET_NOTE_TITLE):  # type: ignore[no-untyped-def]
    return client.post(
        note_path(couple["space"].id),
        json={"title": title, "body": SECRET_NOTE_BODY, "pinned": True},
        headers=auth(couple[token_key]),
    )


def create_gift(client, couple, *, token_key: str = "token_a", title: str = SECRET_GIFT_TITLE):  # type: ignore[no-untyped-def]
    return client.post(
        gift_path(couple["space"].id),
        json={
            "title": title,
            "description": "Private description",
            "recipient": "Ben",
            "occasion": "Anniversary",
            "targetOn": "2026-12-20",
            "priceText": "about 50 EUR",
            "url": SECRET_GIFT_URL,
            "pinned": True,
        },
        headers=auth(couple[token_key]),
    )


class TestPrivateNote:
    def test_owner_can_crud_with_optimistic_concurrency(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = create_note(client, couple)
        assert created.status_code == 201
        note = created.json()
        assert note["ownerId"] == str(couple["anna"].id)
        assert note["spaceId"] == str(couple["space"].id)
        assert note["title"] == SECRET_NOTE_TITLE
        assert note["body"] == SECRET_NOTE_BODY
        assert note["pinned"] is True
        assert note["version"] == 1
        assert created.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{note_path(couple['space'].id)}/{note['id']}",
            json={"title": "  Updated private note  ", "pinned": False},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Updated private note"
        assert updated.json()["pinned"] is False
        assert updated.json()["version"] == 2

        stale = client.patch(
            f"{note_path(couple['space'].id)}/{note['id']}",
            json={"body": "stale"},
            headers=if_match(couple["token_a"], 1),
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        deleted = client.delete(
            f"{note_path(couple['space'].id)}/{note['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204

    def test_partner_unknown_and_foreign_ids_are_indistinguishable(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        partner_headers = auth(couple["token_b"])
        real = client.get(f"{note_path(couple['space'].id)}/{note['id']}", headers=partner_headers)
        unknown = client.get(f"{note_path(couple['space'].id)}/{uuid4()}", headers=partner_headers)
        assert real.status_code == unknown.status_code == 404
        assert real.json() == unknown.json()
        assert real.json()["code"] == "PRIVATE_NOTE_NOT_FOUND"

        foreign_note = client.post(
            note_path(couple["foreign_space"].id),
            json={"title": "Foreign private", "body": "hidden"},
            headers=auth(couple["foreign_token"]),
        ).json()
        foreign = client.get(
            f"{note_path(couple['space'].id)}/{foreign_note['id']}",
            headers=auth(couple["token_a"]),
        )
        own_unknown = client.get(
            f"{note_path(couple['space'].id)}/{uuid4()}", headers=auth(couple["token_a"])
        )
        assert foreign.status_code == own_unknown.status_code == 404
        assert foreign.json() == own_unknown.json()

    def test_each_partner_list_contains_only_own_notes(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        anna = create_note(client, couple, title="Anna private").json()
        ben = create_note(client, couple, token_key="token_b", title="Ben private").json()

        anna_page = client.get(
            note_path(couple["space"].id), headers=auth(couple["token_a"])
        ).json()
        ben_page = client.get(note_path(couple["space"].id), headers=auth(couple["token_b"])).json()
        assert [entry["id"] for entry in anna_page["items"]] == [anna["id"]]
        assert [entry["id"] for entry in ben_page["items"]] == [ben["id"]]
        assert "Ben private" not in str(anna_page)
        assert "Anna private" not in str(ben_page)

    def test_owner_fields_are_server_derived(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            note_path(couple["space"].id),
            json={
                "title": "No",
                "body": "No",
                "ownerId": str(couple["ben"].id),
                "privacyClass": "SPACE_SHARED",
            },
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422


class TestGiftIdea:
    def test_owner_crud_and_status_lifecycle(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = create_gift(client, couple)
        assert created.status_code == 201
        idea = created.json()
        assert idea["ownerId"] == str(couple["anna"].id)
        assert idea["status"] == "IDEA"
        assert idea["url"] == SECRET_GIFT_URL
        assert idea["version"] == 1

        given = client.patch(
            f"{gift_path(couple['space'].id)}/{idea['id']}",
            json={"status": "GIVEN"},
            headers=if_match(couple["token_a"], 1),
        )
        assert given.status_code == 200
        assert given.json()["status"] == "GIVEN"
        assert given.json()["version"] == 2

        forbidden = client.patch(
            f"{gift_path(couple['space'].id)}/{idea['id']}",
            json={"status": "IDEA"},
            headers=if_match(couple["token_a"], 2),
        )
        assert forbidden.status_code == 409
        assert forbidden.json()["code"] == "GIFT_IDEA_STATUS_TRANSITION_INVALID"

        bought = client.patch(
            f"{gift_path(couple['space'].id)}/{idea['id']}",
            json={"status": "BOUGHT", "priceText": None, "url": None},
            headers=if_match(couple["token_a"], 2),
        )
        assert bought.status_code == 200
        assert bought.json()["status"] == "BOUGHT"
        assert bought.json()["priceText"] is None
        assert bought.json()["url"] is None

    @pytest.mark.parametrize(
        ("start", "target", "allowed"),
        [
            ("IDEA", "BOUGHT", True),
            ("IDEA", "GIVEN", True),
            ("BOUGHT", "IDEA", True),
            ("BOUGHT", "GIVEN", True),
            ("GIVEN", "BOUGHT", True),
            ("GIVEN", "IDEA", False),
        ],
    )
    def test_status_transition_matrix(
        self, client, couple, start: str, target: str, allowed: bool
    ) -> None:  # type: ignore[no-untyped-def]
        idea = create_gift(client, couple, title=f"{start}-{target}").json()
        version = 1
        if start != "IDEA":
            seeded = client.patch(
                f"{gift_path(couple['space'].id)}/{idea['id']}",
                json={"status": start},
                headers=if_match(couple["token_a"], version),
            )
            assert seeded.status_code == 200
            version = seeded.json()["version"]

        response = client.patch(
            f"{gift_path(couple['space'].id)}/{idea['id']}",
            json={"status": target},
            headers=if_match(couple["token_a"], version),
        )
        if allowed:
            assert response.status_code == 200
            assert response.json()["status"] == target
        else:
            assert response.status_code == 409
            assert response.json()["code"] == "GIFT_IDEA_STATUS_TRANSITION_INVALID"

    def test_partner_cannot_read_mutate_delete_or_list_owner_idea(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        idea = create_gift(client, couple).json()
        base = f"{gift_path(couple['space'].id)}/{idea['id']}"
        partner_headers = auth(couple["token_b"])
        assert client.get(base, headers=partner_headers).status_code == 404
        assert (
            client.patch(
                base, json={"pinned": False}, headers=if_match(couple["token_b"], 1)
            ).status_code
            == 404
        )
        assert client.delete(base, headers=if_match(couple["token_b"], 1)).status_code == 404
        page = client.get(gift_path(couple["space"].id), headers=partner_headers)
        assert page.status_code == 200
        assert page.json()["items"] == []
        assert SECRET_GIFT_TITLE not in page.text

    def test_url_is_inert_content_and_never_triggers_server_network(
        self, client, couple, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        def fail_network(*args, **kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("GiftIdea URL must not trigger a network request")

        monkeypatch.setattr(socket, "create_connection", fail_network)
        response = create_gift(client, couple)
        assert response.status_code == 201
        assert response.json()["url"] == SECRET_GIFT_URL


class TestPrivateEventRedaction:
    def test_private_content_and_structural_state_never_enter_event_payload(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        create_note(client, couple)
        create_gift(client, couple)
        session.expire_all()
        events = list(
            session.execute(
                select(OutboxEvent).where(OutboxEvent.space_id == couple["space"].id)
            ).scalars()
        )
        private_events = [
            event
            for event in events
            if event.event_type.startswith("PRIVATE_NOTE_")
            or event.event_type.startswith("GIFT_IDEA_")
        ]
        assert private_events
        serialized = "\n".join(
            f"{event.event_type} {event.subject_type} {event.payload.model_dump_json()}"
            for event in private_events
        )
        for secret in (
            SECRET_NOTE_TITLE,
            SECRET_NOTE_BODY,
            SECRET_GIFT_TITLE,
            SECRET_GIFT_URL,
            "about 50 EUR",
            "Anniversary",
        ):
            assert secret not in serialized
        assert "BOUGHT" not in serialized
        assert "GIVEN" not in serialized
