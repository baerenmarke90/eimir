"""HTTP/PostgreSQL acceptance tests for picture ping-pong (#1907 H3, concept B)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.engagement import notification_policy
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.memories.models import Memory, MemoryPayload
from eimir.outbox.models import OutboxEvent
from eimir.picture_ping_pong.models import PicturePingPong
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


def _grant_games(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()


@pytest.fixture
def premium(session: Session, couple):  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    return couple


def _url(couple, suffix: str = "", space_id=None) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{space_id or couple['space'].id}/games/picture-ping-pong{suffix}"


def _headers(couple, who: str = "a"):  # type: ignore[no-untyped-def]
    return auth(couple["token_a" if who == "a" else "token_b"])


STROKE = {"colour": "PERSON", "points": [100, 100, 400, 300, 800, 600]}


def _turn(client, couple, who, turns_done, strokes=None):  # type: ignore[no-untyped-def]
    return client.post(
        _url(couple, "/turns"),
        headers=_headers(couple, who),
        json={"turnsDone": turns_done, "strokes": [STROKE] if strokes is None else strokes},
    )


def _start(client, couple, who="a"):  # type: ignore[no-untyped-def]
    return client.post(_url(couple), headers=_headers(couple, who))


def _memory(session: Session, couple, *, space_id=None, owner_id=None) -> Memory:  # type: ignore[no-untyped-def]
    memory = Memory(
        space_id=space_id or couple["space"].id,
        owner_id=owner_id or couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 11, 16),
        payload=MemoryPayload(title="Unser Bild", body=""),
    )
    session.add(memory)
    session.flush()
    return memory


def _project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


# --- entitlement -----------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("get", "", None),
        ("post", "", None),
        ("post", "/turns", {"turnsDone": 0, "strokes": [STROKE]}),
        ("post", "/finish", {"turnsDone": 1}),
        ("post", "/saved", {"memoryId": "00000000-0000-0000-0000-000000000001"}),
    ],
)
def test_every_seam_requires_the_games_capability(client, couple, method, suffix, body) -> None:  # type: ignore[no-untyped-def]
    response = getattr(client, method)(
        _url(couple, suffix), headers=_headers(couple), **({"json": body} if body else {})
    )
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_outsiders_cannot_read_or_play_a_foreign_picture(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert _start(client, premium).status_code == 200
    # The outsider's own Space holds no grant and has no picture of its own.
    response = client.get(
        _url(premium, space_id=premium["foreign_space"].id),
        headers=auth(premium["token_outsider"]),
    )
    assert response.status_code == 403
    foreign = client.get(_url(premium), headers=auth(premium["token_outsider"]))
    assert foreign.status_code in {403, 404}
    assert "strokes" not in foreign.text


# --- turn order ------------------------------------------------------------


def test_no_picture_until_someone_starts_one(client, premium) -> None:  # type: ignore[no-untyped-def]
    response = client.get(_url(premium), headers=_headers(premium))
    assert response.status_code == 200
    assert response.json() == {"picture": None}
    assert response.headers["cache-control"] == "private, no-store"


def test_the_partner_who_opens_a_picture_draws_first_with_a_squiggle_to_start(
    client, premium
) -> None:  # type: ignore[no-untyped-def]
    picture = _start(client, premium, "b").json()["picture"]
    assert picture["status"] == "DRAWING"
    assert picture["drawerId"] == str(premium["ben"].id)
    assert picture["startedBy"] == str(premium["ben"].id)
    assert picture["turnsDone"] == 0 and picture["maxTurns"] == 6
    [seed] = picture["strokes"]
    assert seed["turn"] == 0 and seed["authorId"] is None and seed["colour"] == "INK"
    assert len(seed["points"]) % 2 == 0 and all(0 <= v <= 1000 for v in seed["points"])
    # The partner sees the same picture.
    seen = client.get(_url(premium), headers=_headers(premium, "a")).json()["picture"]
    assert seen["id"] == picture["id"] and seen["strokes"] == picture["strokes"]


def test_the_opener_may_start_on_a_blank_page_or_with_the_squiggle(client, premium) -> None:  # type: ignore[no-untyped-def]
    blank = client.post(_url(premium), headers=_headers(premium, "a"), json={"starter": "BLANK"})
    assert blank.status_code == 200, blank.text
    picture = blank.json()["picture"]
    assert picture["strokes"] == [] and picture["turnsDone"] == 0
    assert picture["drawerId"] == str(premium["anna"].id)
    # The partner sees the same blank page, and the first turn draws on it.
    seen = client.get(_url(premium), headers=_headers(premium, "b")).json()["picture"]
    assert seen["id"] == picture["id"] and seen["strokes"] == []
    first = _turn(client, premium, "a", 0)
    assert first.status_code == 200, first.text
    assert [stroke["turn"] for stroke in first.json()["picture"]["strokes"]] == [1]

    finished = client.post(
        _url(premium, "/finish"), headers=_headers(premium, "b"), json={"turnsDone": 1}
    )
    assert finished.status_code == 200, finished.text
    squiggle = client.post(
        _url(premium), headers=_headers(premium, "b"), json={"starter": "SQUIGGLE"}
    )
    assert squiggle.status_code == 200, squiggle.text
    [seed] = squiggle.json()["picture"]["strokes"]
    assert seed["turn"] == 0 and seed["authorId"] is None


def test_an_unknown_starter_is_rejected(client, premium) -> None:  # type: ignore[no-untyped-def]
    response = client.post(_url(premium), headers=_headers(premium), json={"starter": "STAMP"})
    assert response.status_code == 422
    extra = client.post(
        _url(premium), headers=_headers(premium), json={"starter": "BLANK", "strokes": []}
    )
    assert extra.status_code == 422
    assert client.get(_url(premium), headers=_headers(premium)).json() == {"picture": None}


def test_a_second_picture_cannot_start_while_one_is_open(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert _start(client, premium).status_code == 200
    again = _start(client, premium, "b")
    assert again.status_code == 409
    assert again.json()["code"] == "PICTURE_PING_PONG_ALREADY_OPEN"


def test_only_the_drawer_may_hand_over_and_turns_alternate(client, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    blocked = _turn(client, premium, "b", 0)
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "PICTURE_PING_PONG_NOT_YOUR_TURN"

    first = _turn(client, premium, "a", 0)
    assert first.status_code == 200, first.text
    picture = first.json()["picture"]
    assert picture["turnsDone"] == 1
    assert picture["drawerId"] == str(premium["ben"].id)
    own = [s for s in picture["strokes"] if s["turn"] == 1]
    assert own and own[0]["authorId"] == str(premium["anna"].id)

    echoed = _turn(client, premium, "a", 1)
    assert echoed.status_code == 409
    assert echoed.json()["code"] == "PICTURE_PING_PONG_NOT_YOUR_TURN"


def test_a_stale_turn_count_is_a_version_conflict(client, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    stale = _turn(client, premium, "a", 3)
    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"


def test_six_turns_finish_the_picture_and_the_last_hand_over_sends_a_finished_notice(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    picture = None
    for index in range(6):
        who = "a" if index % 2 == 0 else "b"
        response = _turn(client, premium, who, index)
        assert response.status_code == 200, response.text
        picture = response.json()["picture"]
    assert picture["status"] == "FINISHED"
    assert picture["drawerId"] is None and picture["turnsDone"] == 6
    assert picture["finishedEarly"] is False
    events = session.scalars(
        select(OutboxEvent.event_type).where(OutboxEvent.space_id == premium["space"].id)
    ).all()
    assert events.count("PICTURE_PING_PONG_TURN") == 5
    assert events.count("PICTURE_PING_PONG_FINISHED") == 1
    over = _turn(client, premium, "a", 6)
    assert over.status_code == 409


# --- validation ------------------------------------------------------------


@pytest.mark.parametrize(
    "strokes",
    [
        [],
        [STROKE] * 4,
        [{"colour": "PERSON", "points": [1, 2, 3]}],
        [{"colour": "PERSON", "points": [1, 2]}],
        [{"colour": "PERSON", "points": [0, 0, 1001, 5]}],
        [{"colour": "PERSON", "points": [0, 0, -1, 5]}],
        [{"colour": "PERSON", "points": [10] * 482}],
        [{"colour": "RED", "points": [1, 2, 3, 4]}],
        [{"colour": "PERSON", "points": [1, 2, 3, 4], "width": 99}],
    ],
)
def test_strokes_are_bounded_and_validated_on_the_server(client, premium, strokes) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    response = _turn(client, premium, "a", 0, strokes)
    assert response.status_code == 422
    assert client.get(_url(premium), headers=_headers(premium)).json()["picture"]["turnsDone"] == 0


def test_a_turn_may_use_three_strokes_and_all_three_colours(client, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    strokes = [
        {"colour": colour, "points": [10, 10, 500, 500]} for colour in ("PERSON", "INK", "SUN")
    ]
    response = _turn(client, premium, "a", 0, strokes)
    assert response.status_code == 200
    assert [s["colour"] for s in response.json()["picture"]["strokes"][1:]] == [
        "PERSON",
        "INK",
        "SUN",
    ]


# --- finishing early, saving, restarting ------------------------------------


def test_either_partner_can_finish_early_but_not_an_empty_picture(client, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    empty = client.post(
        _url(premium, "/finish"), headers=_headers(premium, "b"), json={"turnsDone": 0}
    )
    assert empty.status_code == 409
    assert empty.json()["code"] == "PICTURE_PING_PONG_NOTHING_DRAWN"

    _turn(client, premium, "a", 0)
    # Ben is the drawer now; Anna (waiting) may still call it finished.
    done = client.post(
        _url(premium, "/finish"), headers=_headers(premium, "a"), json={"turnsDone": 1}
    )
    assert done.status_code == 200, done.text
    picture = done.json()["picture"]
    assert picture["status"] == "FINISHED" and picture["finishedEarly"] is True
    assert picture["drawerId"] is None
    assert _turn(client, premium, "b", 1).status_code == 409


def test_saving_records_the_memory_once_and_only_a_readable_one(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    _turn(client, premium, "a", 0)
    early = client.post(
        _url(premium, "/saved"),
        headers=_headers(premium, "a"),
        json={"memoryId": str(_memory(session, premium).id)},
    )
    assert early.status_code == 409
    assert early.json()["code"] == "PICTURE_PING_PONG_NOT_FINISHED"

    client.post(_url(premium, "/finish"), headers=_headers(premium, "b"), json={"turnsDone": 1})
    foreign = _memory(
        session,
        premium,
        space_id=premium["foreign_space"].id,
        owner_id=premium["outsider"].id,
    )
    missing = client.post(
        _url(premium, "/saved"), headers=_headers(premium), json={"memoryId": str(foreign.id)}
    )
    assert missing.status_code == 404

    memory = _memory(session, premium)
    saved = client.post(
        _url(premium, "/saved"), headers=_headers(premium, "b"), json={"memoryId": str(memory.id)}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["picture"]["savedMemoryId"] == str(memory.id)
    twice = client.post(
        _url(premium, "/saved"), headers=_headers(premium), json={"memoryId": str(memory.id)}
    )
    assert twice.status_code == 409
    assert twice.json()["code"] == "PICTURE_PING_PONG_ALREADY_SAVED"


def test_a_finished_picture_is_replaced_by_a_new_one(client, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    _turn(client, premium, "a", 0)
    client.post(_url(premium, "/finish"), headers=_headers(premium), json={"turnsDone": 1})
    fresh = _start(client, premium, "b")
    assert fresh.status_code == 200
    picture = fresh.json()["picture"]
    assert picture["status"] == "DRAWING" and picture["turnsDone"] == 0
    assert picture["drawerId"] == str(premium["ben"].id)
    assert picture["savedMemoryId"] is None and len(picture["strokes"]) == 1


# --- notification ----------------------------------------------------------


def test_the_partner_is_told_it_is_their_turn_and_the_notice_goes_stale(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    _turn(client, premium, "a", 0)
    _project(session)
    notices = session.scalars(
        select(Notification).where(Notification.kind == "PICTURE_PING_PONG_TURN")
    ).all()
    assert [n.recipient_account_id for n in notices] == [premium["ben"].id]
    assert notices[0].target_type == "PICTURE_GAME" and notices[0].actor_id == premium["anna"].id

    listed = client.get(
        f"/api/v1/spaces/{premium['space'].id}/notifications", headers=_headers(premium, "b")
    )
    assert listed.status_code == 200
    kinds = [item["kind"] for item in listed.json()["items"]]
    assert "PICTURE_PING_PONG_TURN" in kinds
    assert "PICTURE_PING_PONG_TURN" not in [
        item["kind"]
        for item in client.get(
            f"/api/v1/spaces/{premium['space'].id}/notifications", headers=_headers(premium, "a")
        ).json()["items"]
    ]

    # Ben hands over; the notice for Ben is no longer current.
    _turn(client, premium, "b", 1)
    after = client.get(
        f"/api/v1/spaces/{premium['space'].id}/notifications", headers=_headers(premium, "b")
    ).json()["items"]
    assert "PICTURE_PING_PONG_TURN" not in [item["kind"] for item in after]


def test_repeated_turns_coalesce_to_one_notice_per_recipient_and_picture(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    for index in range(4):
        _turn(client, premium, "a" if index % 2 == 0 else "b", index)
        _project(session)
    rows = session.scalars(
        select(Notification).where(Notification.kind == "PICTURE_PING_PONG_TURN")
    ).all()
    assert sorted(str(row.recipient_account_id) for row in rows) == sorted(
        [str(premium["anna"].id), str(premium["ben"].id)]
    )


def _finished_notices(session: Session) -> list[Notification]:
    return list(
        session.scalars(
            select(Notification).where(
                Notification.kind == NotificationKind.PICTURE_PING_PONG_FINISHED.value
            )
        )
    )


def _listed(client, couple, who: str) -> list[str]:  # type: ignore[no-untyped-def]
    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications", headers=_headers(couple, who)
    )
    assert response.status_code == 200, response.text
    return [item["kind"] for item in response.json()["items"]]


def test_the_partner_learns_once_when_the_last_turn_completes_the_picture(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    for index in range(6):
        _turn(client, premium, "a" if index % 2 == 0 else "b", index)
    _project(session)
    # Ben drew the sixth turn; only Anna is told, and never by a turn notice.
    [notice] = _finished_notices(session)
    assert notice.recipient_account_id == premium["anna"].id
    assert notice.actor_id == premium["ben"].id and notice.target_type == "PICTURE_GAME"
    assert "PICTURE_PING_PONG_FINISHED" in _listed(client, premium, "a")
    assert "PICTURE_PING_PONG_FINISHED" not in _listed(client, premium, "b")


def test_an_early_finish_tells_only_the_partner_and_a_new_picture_retires_it(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    _turn(client, premium, "a", 0)
    finished = client.post(
        _url(premium, "/finish"), headers=_headers(premium, "b"), json={"turnsDone": 1}
    )
    assert finished.status_code == 200, finished.text
    _project(session)
    [notice] = _finished_notices(session)
    assert notice.recipient_account_id == premium["anna"].id
    assert notice.actor_id == premium["ben"].id
    assert "PICTURE_PING_PONG_FINISHED" in _listed(client, premium, "a")
    assert "PICTURE_PING_PONG_FINISHED" not in _listed(client, premium, "b")

    _start(client, premium, "b")
    assert _finished_notices(session) == []
    assert "PICTURE_PING_PONG_FINISHED" not in _listed(client, premium, "a")


def test_the_finished_notice_shares_the_turn_notice_switch_and_quiet_hours() -> None:
    from eimir.engagement import notification_preferences, quiet_hours_preferences

    kind = NotificationKind.PICTURE_PING_PONG_FINISHED
    policy = notification_policy.for_kind(kind.value)
    assert policy is not None and policy.push_immediately
    assert kind in quiet_hours_preferences.DEFERABLE_KINDS
    assert notification_preferences.INHERITED_KINDS[kind] is NotificationKind.THINKING_OF_YOU


def test_the_turn_notice_is_a_quiet_deferable_push_that_follows_the_catalog() -> None:
    from eimir.engagement import notification_preferences, quiet_hours_preferences

    policy = notification_policy.for_kind(NotificationKind.PICTURE_PING_PONG_TURN.value)
    assert policy is not None and policy.push_immediately
    assert NotificationKind.PICTURE_PING_PONG_TURN in quiet_hours_preferences.DEFERABLE_KINDS
    assert (
        notification_preferences.INHERITED_KINDS[NotificationKind.PICTURE_PING_PONG_TURN]
        is NotificationKind.THINKING_OF_YOU
    )


# --- lifecycle and data minimisation ----------------------------------------


def test_the_picture_is_dropped_when_the_couple_changes(client, session: Session, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    membership = relationship_service.require_membership(
        session, premium["ben"], premium["space"].id
    )
    relationship_service.end_membership(session, membership)
    session.flush()
    assert session.scalar(select(PicturePingPong.id)) is None


def test_stored_row_holds_only_strokes_and_turn_state(client, session: Session, premium) -> None:  # type: ignore[no-untyped-def]
    _start(client, premium, "a")
    columns = {
        row[0]
        for row in session.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name = 'picture_ping_pong'"
            )
        )
    }
    assert columns == {
        "id",
        "space_id",
        "started_by",
        "status",
        "drawer_id",
        "turns_done",
        "finished_early",
        "saved_memory_id",
        "crypto_version",
        "payload",
        "version",
        "created_at",
        "updated_at",
    }
