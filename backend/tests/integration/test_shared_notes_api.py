"""PostgreSQL/HTTP acceptance coverage for shared notes and the Plan-note link (#1969)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.engagement.models import Notification
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_TITLE = "A title that must never enter an event"
SECRET_BODY = "A body that must never enter an event"


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/shared-notes"


def instant(value: str) -> datetime:
    """Compare instants regardless of the UTC offset spelling the server used."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


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
    # Ben belongs to both spaces so cross-space checks reach the note
    # authorization boundary instead of stopping at Membership.
    relationship_service.add_member(session, foreign_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "foreign_token": sign_in(session, foreign),
    }


def create_note(  # type: ignore[no-untyped-def]
    client,
    couple,
    *,
    token_key: str = "token_a",
    title: str | None = "Door",
    body: str | None = "Code 4172",
):
    payload: dict[str, object] = {}
    if title is not None:
        payload["title"] = title
    if body is not None:
        payload["body"] = body
    return client.post(path(couple["space"].id), json=payload, headers=auth(couple[token_key]))


class TestSharedNoteCrud:
    def test_partner_edits_and_the_editor_line_follows(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = create_note(client, couple)
        assert created.status_code == 201
        note = created.json()
        assert note["title"] == "Door"
        assert note["body"] == "Code 4172"
        assert note["pinned"] is False
        assert note["wirTitleOnly"] is False
        assert note["createdBy"] == str(couple["anna"].id)
        assert note["creator"]["displayName"] == "Anna"
        assert note["editor"]["displayName"] == "Anna"
        assert note["version"] == 1
        assert created.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{note['id']}",
            json={"body": "  Code 4172\r\nCheck-in from 3 pm  "},
            headers=if_match(couple["token_b"], 1),
        )
        assert updated.status_code == 200
        body = updated.json()
        assert body["body"] == "Code 4172\nCheck-in from 3 pm"
        assert body["createdBy"] == str(couple["anna"].id)
        assert body["editor"]["displayName"] == "Ben"
        assert body["version"] == 2

    def test_stale_write_conflicts_and_delete_needs_the_current_version(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{note['id']}",
            json={"title": "Door code"},
            headers=if_match(couple["token_b"], 1),
        )
        stale = client.patch(
            f"{path(couple['space'].id)}/{note['id']}",
            json={"title": "Mine"},
            headers=if_match(couple["token_a"], 1),
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"
        stale_delete = client.delete(
            f"{path(couple['space'].id)}/{note['id']}", headers=if_match(couple["token_a"], 1)
        )
        assert stale_delete.status_code == 409
        deleted = client.delete(
            f"{path(couple['space'].id)}/{note['id']}", headers=if_match(couple["token_a"], 2)
        )
        assert deleted.status_code == 204
        gone = client.get(
            f"{path(couple['space'].id)}/{note['id']}", headers=auth(couple["token_a"])
        )
        assert gone.status_code == 404

    def test_title_is_optional_but_a_note_cannot_be_empty(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        body_only = create_note(client, couple, title=None, body="Just words")
        assert body_only.status_code == 201
        assert body_only.json()["title"] == ""
        title_only = create_note(client, couple, title="Only a title", body=None)
        assert title_only.status_code == 201

        for payload in ({}, {"title": "  ", "body": "\n \n"}):
            empty = client.post(
                path(couple["space"].id), json=payload, headers=auth(couple["token_a"])
            )
            assert empty.status_code == 422
            assert empty.json()["code"] == "SHARED_NOTE_EMPTY"

        note = body_only.json()
        clearing = client.patch(
            f"{path(couple['space'].id)}/{note['id']}",
            json={"body": ""},
            headers=if_match(couple["token_a"], 1),
        )
        assert clearing.status_code == 422
        assert clearing.json()["code"] == "SHARED_NOTE_EMPTY"

    def test_too_long_text_is_a_validation_error(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = create_note(client, couple, body="x" * 20_001)
        assert response.status_code == 422
        assert response.json()["code"] == "SHARED_NOTE_BODY_TOO_LONG"

    def test_an_unchanged_write_is_not_an_edit(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        again = client.patch(
            f"{path(couple['space'].id)}/{note['id']}",
            json={"title": "Door", "body": "Code 4172"},
            headers=if_match(couple["token_b"], 1),
        )
        assert again.status_code == 200
        assert again.json()["version"] == 1
        assert again.json()["editor"]["displayName"] == "Anna"

    def test_created_by_is_server_derived(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json={"title": "x", "createdBy": str(couple["ben"].id)},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422


class TestPresentation:
    def test_pinning_is_idempotent_and_is_not_an_edit(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        url = f"{path(couple['space'].id)}/{note['id']}/presentation"
        pinned = client.put(url, json={"pinned": True}, headers=auth(couple["token_b"]))
        assert pinned.status_code == 200
        body = pinned.json()
        assert body["pinned"] is True
        assert body["editor"]["displayName"] == "Anna"
        assert instant(body["editedAt"]) == instant(note["editedAt"])
        assert body["version"] == 2

        again = client.put(url, json={"pinned": True}, headers=auth(couple["token_b"]))
        assert again.json()["version"] == 2

        titled = client.put(url, json={"wirTitleOnly": True}, headers=auth(couple["token_a"]))
        assert titled.json()["wirTitleOnly"] is True
        assert titled.json()["pinned"] is True

        for payload in ({}, {"pinned": None}):
            rejected = client.put(url, json=payload, headers=auth(couple["token_a"]))
            assert rejected.status_code == 422

    def test_filter_cursor_and_ids(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        first = create_note(client, couple, title="First").json()
        second = create_note(client, couple, title="Second").json()
        third = create_note(client, couple, title="Third").json()
        client.put(
            f"{path(couple['space'].id)}/{first['id']}/presentation",
            json={"pinned": True},
            headers=auth(couple["token_a"]),
        )

        everything = client.get(path(couple["space"].id), headers=auth(couple["token_b"])).json()
        assert [row["id"] for row in everything["items"]] == [
            third["id"],
            second["id"],
            first["id"],
        ]

        pinned = client.get(
            f"{path(couple['space'].id)}?pinned=true", headers=auth(couple["token_b"])
        ).json()
        assert [row["id"] for row in pinned["items"]] == [first["id"]]
        unpinned = client.get(
            f"{path(couple['space'].id)}?pinned=false", headers=auth(couple["token_b"])
        ).json()
        assert [row["id"] for row in unpinned["items"]] == [third["id"], second["id"]]

        page = client.get(
            f"{path(couple['space'].id)}?limit=2", headers=auth(couple["token_a"])
        ).json()
        assert page["hasMore"] is True
        rest = client.get(
            f"{path(couple['space'].id)}?limit=2&cursor={page['nextCursor']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert [row["id"] for row in rest["items"]] == [first["id"]]
        assert rest["hasMore"] is False

        by_ids = client.get(
            f"{path(couple['space'].id)}?ids={second['id']}", headers=auth(couple["token_a"])
        ).json()
        assert [row["id"] for row in by_ids["items"]] == [second["id"]]

        foreign = client.get(
            f"{path(couple['foreign_space'].id)}?limit=2&cursor={page['nextCursor']}",
            headers=auth(couple["token_b"]),
        )
        assert foreign.status_code == 400
        assert foreign.json()["code"] == "INVALID_CURSOR"


class TestIsolation:
    def test_foreign_space_and_outsiders_see_nothing(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        outsider = client.get(
            f"{path(couple['space'].id)}/{note['id']}", headers=auth(couple["foreign_token"])
        )
        assert outsider.status_code in {403, 404}
        cross_space = client.get(
            f"{path(couple['foreign_space'].id)}/{note['id']}", headers=auth(couple["token_b"])
        )
        assert cross_space.status_code == 404
        assert cross_space.json()["code"] == "SHARED_NOTE_NOT_FOUND"

    def test_private_notes_never_appear_in_shared_notes(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        private = client.post(
            f"/api/v1/spaces/{couple['space'].id}/private/notes",
            json={"title": "Secret", "body": "For me only"},
            headers=auth(couple["token_a"]),
        )
        assert private.status_code == 201
        shared = client.get(path(couple["space"].id), headers=auth(couple["token_b"])).json()
        assert shared["items"] == []
        by_id = client.get(
            f"{path(couple['space'].id)}/{private.json()['id']}", headers=auth(couple["token_a"])
        )
        assert by_id.status_code == 404

    def test_events_carry_references_only(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple, title=SECRET_TITLE, body=SECRET_BODY).json()
        client.patch(
            f"{path(couple['space'].id)}/{note['id']}",
            json={"body": SECRET_BODY + " changed"},
            headers=if_match(couple["token_b"], 1),
        )
        events = list(
            session.scalars(select(OutboxEvent).where(OutboxEvent.space_id == couple["space"].id))
        )
        kinds = {event.event_type for event in events}
        assert {"SHARED_NOTE_CREATED", "SHARED_NOTE_UPDATED"} <= kinds
        for event in events:
            assert SECRET_TITLE not in str(event.payload)
            assert SECRET_BODY not in str(event.payload)


class TestSearch:
    def test_both_partners_find_a_shared_note_but_never_the_private_one(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_note(client, couple, title="Lissabon", body="Schluesselbox links").json()
        private = client.post(
            f"/api/v1/spaces/{couple['space'].id}/private/notes",
            json={"title": "Lissabon geheim", "body": "Nur ich"},
            headers=auth(couple["token_a"]),
        ).json()
        search = f"/api/v1/spaces/{couple['space'].id}/search"

        for token in ("token_a", "token_b"):
            found = client.get(
                search, params={"q": "Lissabon"}, headers=auth(couple[token])
            ).json()["items"]
            shared_hits = [row for row in found if row["type"] == "SHARED_NOTE"]
            assert [row["id"] for row in shared_hits] == [shared["id"]]
            assert shared_hits[0]["scope"] == "SHARED"

        ben_private = [
            row
            for row in client.get(
                search, params={"q": "Lissabon"}, headers=auth(couple["token_b"])
            ).json()["items"]
            if row["type"] == "PRIVATE_NOTE"
        ]
        assert ben_private == []
        assert private["id"] not in {
            row["id"]
            for row in client.get(
                search, params={"q": "Lissabon"}, headers=auth(couple["token_b"])
            ).json()["items"]
        }

        by_body = client.get(
            search,
            params={"q": "Schluesselbox", "type": "SHARED_NOTE"},
            headers=auth(couple["token_b"]),
        ).json()["items"]
        assert [row["id"] for row in by_body] == [shared["id"]]


class TestNotifications:
    """The partner hears about a note; the author does not; no text leaves the note."""

    def _project(self, session: Session, space_id) -> None:  # type: ignore[no-untyped-def]
        from eimir.engagement import service as engagement

        events = list(
            session.scalars(
                select(OutboxEvent)
                .where(OutboxEvent.space_id == space_id)
                .order_by(OutboxEvent.created_at, OutboxEvent.id)
            )
        )
        for event in events:
            engagement.project_event(session, event)
        session.flush()

    def _notices(self, session: Session, recipient) -> list[Notification]:  # type: ignore[no-untyped-def]
        return list(
            session.scalars(
                select(Notification)
                .where(Notification.recipient_account_id == recipient.id)
                .order_by(Notification.created_at, Notification.id)
            )
        )

    def test_a_new_note_notifies_only_the_partner_without_any_text(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple, title=SECRET_TITLE, body=SECRET_BODY).json()
        self._project(session, couple["space"].id)

        ben = self._notices(session, couple["ben"])
        assert [(n.kind, str(n.target_id), n.target_type) for n in ben] == [
            ("SHARED_NOTE_CREATED", note["id"], "SHARED_NOTE")
        ]
        assert ben[0].actor_id == couple["anna"].id
        assert self._notices(session, couple["anna"]) == []
        assert not hasattr(ben[0], "payload") and not hasattr(ben[0], "body")

    def test_edits_of_one_note_leave_one_current_notice_and_pinning_is_silent(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        client.put(
            f"{path(couple['space'].id)}/{note['id']}/presentation",
            json={"pinned": True},
            headers=auth(couple["token_a"]),
        )
        for version, text in ((2, "first change"), (3, "second change")):
            changed = client.patch(
                f"{path(couple['space'].id)}/{note['id']}",
                json={"body": text},
                headers=if_match(couple["token_a"], version),
            )
            assert changed.status_code == 200, changed.text
        self._project(session, couple["space"].id)

        kinds = [n.kind for n in self._notices(session, couple["ben"])]
        assert sorted(kinds) == ["SHARED_NOTE_CHANGED", "SHARED_NOTE_CREATED"]
        assert self._notices(session, couple["anna"]) == []

    def test_a_deleted_note_leaves_no_dangling_notice(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        client.delete(
            f"{path(couple['space'].id)}/{note['id']}", headers=if_match(couple["token_a"], 1)
        )
        self._project(session, couple["space"].id)
        assert self._notices(session, couple["ben"]) == []


class TestActivityFeed:
    """The feed names a note and who wrote or changed it, and never carries its text."""

    def _project(self, session: Session, space_id) -> None:  # type: ignore[no-untyped-def]
        from eimir.engagement import service as engagement

        for event in session.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.space_id == space_id)
            .order_by(OutboxEvent.created_at, OutboxEvent.id)
        ).all():
            engagement.project_event(session, event)
        session.flush()

    def _feed(self, client, couple, token_key: str, scope: str = "shared") -> list[dict]:  # type: ignore[no-untyped-def,type-arg]
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}/activity",
            params={"scope": scope},
            headers=auth(couple[token_key]),
        )
        assert response.status_code == 200, response.text
        return [
            item
            for item in response.json()["items"]
            if item["kind"] in {"SHARED_NOTE_CREATED", "SHARED_NOTE_CHANGED"}
        ]

    def test_a_new_note_reaches_the_partner_feed_with_its_title_only(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple, title="Weekend plan", body=SECRET_BODY).json()
        self._project(session, couple["space"].id)

        items = self._feed(client, couple, "token_b")
        assert [(i["kind"], i["targetType"], i["targetId"]) for i in items] == [
            ("SHARED_NOTE_CREATED", "SHARED_NOTE", note["id"])
        ]
        assert items[0]["actorId"] == str(couple["anna"].id)
        assert items[0]["target"]["title"] == "Weekend plan"
        assert SECRET_BODY not in str(items)
        # The author's own writing is quiet in the shared feed and kept in the own one.
        assert self._feed(client, couple, "token_a") == []
        assert len(self._feed(client, couple, "token_a", scope="own")) == 1

    def test_a_note_without_a_title_and_a_title_only_wir_note_never_expose_text(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        untitled = create_note(client, couple, title=None, body=SECRET_BODY).json()
        hidden = create_note(client, couple, title="Guest wifi", body=SECRET_BODY).json()
        client.put(
            f"{path(couple['space'].id)}/{hidden['id']}/presentation",
            json={"pinned": True, "wirTitleOnly": True},
            headers=auth(couple["token_a"]),
        )
        self._project(session, couple["space"].id)

        by_target = {i["targetId"]: i for i in self._feed(client, couple, "token_b")}
        assert by_target[untitled["id"]]["target"]["title"] is None
        assert by_target[hidden["id"]]["target"]["title"] == "Guest wifi"
        assert SECRET_BODY not in str(by_target)

    def test_edits_keep_one_changed_entry_that_moves_forward_and_pinning_adds_none(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        client.put(
            f"{path(couple['space'].id)}/{note['id']}/presentation",
            json={"pinned": True},
            headers=auth(couple["token_a"]),
        )
        for version, token_key, text in ((2, "token_a", "one"), (3, "token_b", "two")):
            changed = client.patch(
                f"{path(couple['space'].id)}/{note['id']}",
                json={"body": text},
                headers=if_match(couple[token_key], version),
            )
            assert changed.status_code == 200, changed.text
        self._project(session, couple["space"].id)
        # Projecting the same events again must not add entries.
        self._project(session, couple["space"].id)

        items = self._feed(client, couple, "token_a")
        # Ben made the latest change, so Anna sees one changed entry by him; her
        # own creation is quiet in the shared feed.
        assert [(i["kind"], i["actorId"]) for i in items] == [
            ("SHARED_NOTE_CHANGED", str(couple["ben"].id))
        ]
        from eimir.engagement.models import Activity

        rows = session.scalars(
            select(Activity).where(Activity.target_id == UUID(note["id"])).order_by(Activity.kind)
        ).all()
        assert [row.kind for row in rows] == ["SHARED_NOTE_CHANGED", "SHARED_NOTE_CREATED"]

    def test_a_deleted_note_leaves_the_feed(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        note = create_note(client, couple).json()
        self._project(session, couple["space"].id)
        assert len(self._feed(client, couple, "token_b")) == 1
        client.delete(
            f"{path(couple['space'].id)}/{note['id']}", headers=if_match(couple["token_a"], 1)
        )
        assert self._feed(client, couple, "token_b") == []


class TestPlanLinks:
    def _plan(self, client, couple, title: str = "Trip", token_key: str = "token_a") -> dict:  # type: ignore[no-untyped-def,type-arg]
        return client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": title},
            headers=auth(couple[token_key]),
        ).json()

    def test_links_are_many_to_many_idempotent_and_ordered(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        base = f"/api/v1/spaces/{couple['space'].id}/plans"
        plans = [self._plan(client, couple, "Trip"), self._plan(client, couple, "Weekend")]
        notes = [create_note(client, couple, title=title).json() for title in ("Door", "Food")]
        for plan in plans:
            for note in notes:
                link = f"{base}/{plan['id']}/notes/{note['id']}"
                assert client.put(link, headers=auth(couple["token_a"])).status_code == 204
                assert client.put(link, headers=auth(couple["token_b"])).status_code == 204
        for plan in plans:
            response = client.get(f"{base}/{plan['id']}/notes", headers=auth(couple["token_b"]))
            assert [row["id"] for row in response.json()] == [notes[1]["id"], notes[0]["id"]]

        link = f"{base}/{plans[0]['id']}/notes/{notes[0]['id']}"
        assert client.delete(link, headers=auth(couple["token_a"])).status_code == 204
        assert (
            client.get(
                f"{path(couple['space'].id)}/{notes[0]['id']}", headers=auth(couple["token_a"])
            ).status_code
            == 200
        )
        assert (
            len(
                client.get(f"{base}/{plans[0]['id']}/notes", headers=auth(couple["token_a"])).json()
            )
            == 1
        )
        assert (
            len(
                client.get(f"{base}/{plans[1]['id']}/notes", headers=auth(couple["token_a"])).json()
            )
            == 2
        )

        events = list(
            session.scalars(select(OutboxEvent).where(OutboxEvent.event_type == "PLAN_NOTE_LINKED"))
        )
        assert len(events) == 4
        assert all(
            set(event.payload.model_dump(exclude_none=True)) <= {"target_type", "target_id"}
            for event in events
        )
        assert {event.payload.target_type for event in events} == {"SHARED_NOTE"}

    def test_target_absence_is_privacy_safe(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        base = f"/api/v1/spaces/{couple['space'].id}/plans"
        plan = self._plan(client, couple, token_key="token_b")
        foreign = client.post(
            path(couple["foreign_space"].id),
            json={"title": "Hidden"},
            headers=auth(couple["token_b"]),
        ).json()
        private = client.post(
            f"/api/v1/spaces/{couple['space'].id}/private/notes",
            json={"title": "Secret", "body": "Mine"},
            headers=auth(couple["token_b"]),
        ).json()
        codes = []
        for target in (foreign["id"], private["id"], str(uuid4())):
            response = client.put(
                f"{base}/{plan['id']}/notes/{target}", headers=auth(couple["token_b"])
            )
            assert response.status_code == 404
            codes.append(response.json()["code"])
        assert codes == ["RELATION_TARGET_NOT_FOUND"] * 3

    def test_deleting_a_note_or_a_plan_removes_only_the_link(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        base = f"/api/v1/spaces/{couple['space'].id}/plans"
        plan = self._plan(client, couple)
        note = create_note(client, couple).json()
        link = f"{base}/{plan['id']}/notes/{note['id']}"
        assert client.put(link, headers=auth(couple["token_a"])).status_code == 204

        deleted_note = client.delete(
            f"{path(couple['space'].id)}/{note['id']}", headers=if_match(couple["token_a"], 1)
        )
        assert deleted_note.status_code == 204
        assert (
            client.get(f"{base}/{plan['id']}/notes", headers=auth(couple["token_a"])).json() == []
        )
        assert (
            client.get(f"{base}/{plan['id']}", headers=auth(couple["token_a"])).status_code == 200
        )

        other = create_note(client, couple, title="Kept").json()
        assert (
            client.put(
                f"{base}/{plan['id']}/notes/{other['id']}", headers=auth(couple["token_a"])
            ).status_code
            == 204
        )
        removed_plan = client.delete(
            f"{base}/{plan['id']}", headers=if_match(couple["token_a"], plan["version"])
        )
        assert removed_plan.status_code == 204
        assert (
            client.get(
                f"{path(couple['space'].id)}/{other['id']}", headers=auth(couple["token_a"])
            ).status_code
            == 200
        )
