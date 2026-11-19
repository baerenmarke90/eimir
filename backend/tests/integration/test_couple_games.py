"""HTTP/PostgreSQL acceptance tests for remote couple games.

Who of us, Wish detective and Our moments played at a distance: each partner
on their own device, with one shared turn notice kind.
"""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.couple_games.models import WHO_OF_US_QUESTION_IDS, CoupleGame
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
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishPayload, WishStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

KIND = NotificationKind.COUPLE_GAME_TURN.value
# Localized product fixtures (wish titles).
STAR_WISH = "Sternegucken im Garten"
SEA_WISH = "Wochenende am Meer"


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


@pytest.fixture
def premium(session: Session, couple):  # type: ignore[no-untyped-def]
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
    return couple


def _url(couple, game: str, suffix: str = "", space_id=None) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{space_id or couple['space'].id}/games/{game}{suffix}"


def _headers(couple, who: str = "a"):  # type: ignore[no-untyped-def]
    return auth(couple["token_a" if who == "a" else "token_b"])


def _id(couple, who: str) -> str:  # type: ignore[no-untyped-def]
    return str(couple["anna" if who == "a" else "ben"].id)


def _project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent)
        .where(OutboxEvent.processed_at.is_(None))
        .order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
        event.processed_at = now()
    session.flush()


def _turn_events(session: Session, couple) -> list[OutboxEvent]:  # type: ignore[no-untyped-def]
    return list(
        session.scalars(
            select(OutboxEvent)
            .where(OutboxEvent.space_id == couple["space"].id, OutboxEvent.event_type == KIND)
            .order_by(OutboxEvent.created_at, OutboxEvent.id)
        )
    )


def _listed_kinds(client, couple, who: str) -> list[tuple[str, str | None]]:  # type: ignore[no-untyped-def]
    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications", headers=_headers(couple, who)
    )
    assert response.status_code == 200, response.text
    return [(item["kind"], item.get("targetType")) for item in response.json()["items"]]


def _wish(session: Session, couple, who: str, title: str, status=WishStatus.OPEN) -> Wish:  # type: ignore[no-untyped-def]
    wish = Wish(
        space_id=couple["space"].id,
        owner_id=couple["anna" if who == "a" else "ben"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        status=status.value,
        payload=WishPayload(title=title),
    )
    session.add(wish)
    session.flush()
    return wish


def _photo_memory(
    session: Session,
    couple,  # type: ignore[no-untyped-def]
    title: str,
    *,
    with_photo: bool = True,
) -> Memory:
    memory = Memory(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2025, 6, 13),
        payload=MemoryPayload(title=title, body="Body"),
    )
    session.add(memory)
    session.flush()
    if not with_photo:
        return memory
    attachment = Attachment(
        space_id=memory.space_id,
        owner_id=memory.owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=100,
        mime_type="image/jpeg",
        size=100,
        width=1200,
        height=800,
        ready_at=now(),
        payload=AttachmentPayload(original_name=f"{title}.jpg"),
    )
    session.add(attachment)
    session.flush()
    session.add(MemoryAttachment(memory_id=memory.id, attachment_id=attachment.id, position=0))
    session.flush()
    return memory


# --- shared gates ------------------------------------------------------------------

SEAMS = [
    ("get", "who-of-us", "", None),
    ("post", "who-of-us", "", None),
    (
        "post",
        "who-of-us",
        "/answers",
        {"gameId": str(uuid4()), "questionId": "snack", "partnerId": str(uuid4())},
    ),
    ("post", "who-of-us", "/end", {"gameId": str(uuid4())}),
    ("get", "wish-detective", "", None),
    ("post", "wish-detective", "", None),
    ("post", "wish-detective", "/skip", {"gameId": str(uuid4()), "round": 0}),
    (
        "post",
        "wish-detective",
        "/clues",
        {"gameId": str(uuid4()), "round": 0, "clues": ["a", "b", "c"]},
    ),
    ("post", "wish-detective", "/guesses", {"gameId": str(uuid4()), "round": 0}),
    ("post", "wish-detective", "/end", {"gameId": str(uuid4())}),
    ("get", "our-moments", "", None),
    ("post", "our-moments", "", None),
    ("post", "our-moments", "/flips", {"gameId": str(uuid4()), "flipsDone": 0, "position": 0}),
    ("post", "our-moments", "/end", {"gameId": str(uuid4())}),
]


@pytest.mark.parametrize(("method", "game", "suffix", "body"), SEAMS)
def test_every_seam_requires_the_games_capability(
    client, couple, method, game, suffix, body
) -> None:  # type: ignore[no-untyped-def]
    response = getattr(client, method)(
        _url(couple, game, suffix), headers=_headers(couple), **({"json": body} if body else {})
    )
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


@pytest.mark.parametrize("game", ["who-of-us", "wish-detective", "our-moments"])
def test_no_game_until_someone_starts_one_and_nothing_is_cached(client, premium, game) -> None:  # type: ignore[no-untyped-def]
    response = client.get(_url(premium, game), headers=_headers(premium))
    assert response.status_code == 200
    assert response.json()["game"] is None
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("game", ["who-of-us", "wish-detective", "our-moments"])
def test_a_game_needs_two_partners(client, session: Session, game) -> None:  # type: ignore[no-untyped-def]
    solo = make_account(session, "Solo")
    space = make_space(session, solo)
    entitlement_service.record_grant(
        session,
        space_id=space.id,
        account_id=solo.id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()
    response = client.post(
        f"/api/v1/spaces/{space.id}/games/{game}", headers=auth(sign_in(session, solo))
    )
    assert response.status_code == 409
    assert response.json()["code"] == "COUPLE_GAME_COUPLE_REQUIRED"


def test_outsiders_cannot_read_a_foreign_game(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert client.post(_url(premium, "who-of-us"), headers=_headers(premium)).status_code == 200
    foreign = client.get(_url(premium, "who-of-us"), headers=auth(premium["token_outsider"]))
    assert foreign.status_code in {403, 404}
    assert "questions" not in foreign.text


def test_the_turn_notice_is_a_quiet_deferable_push_on_the_thinking_switch() -> None:
    from eimir.engagement import notification_preferences, quiet_hours_preferences

    policy = notification_policy.for_kind(KIND)
    assert policy is not None and policy.push_immediately
    assert NotificationKind.COUPLE_GAME_TURN in quiet_hours_preferences.DEFERABLE_KINDS
    assert (
        notification_preferences.INHERITED_KINDS[NotificationKind.COUPLE_GAME_TURN]
        is NotificationKind.THINKING_OF_YOU
    )


# --- Who of us ---------------------------------------------------------------------


def _start_who(client, couple, who="a"):  # type: ignore[no-untyped-def]
    response = client.post(_url(couple, "who-of-us"), headers=_headers(couple, who))
    assert response.status_code == 200, response.text
    return response.json()["game"]


def _answer(client, couple, who, game_id, question_id, partner_id):  # type: ignore[no-untyped-def]
    return client.post(
        _url(couple, "who-of-us", "/answers"),
        headers=_headers(couple, who),
        json={"gameId": game_id, "questionId": question_id, "partnerId": partner_id},
    )


def test_who_of_us_uses_the_closed_question_list_once_per_open_game(client, premium) -> None:  # type: ignore[no-untyped-def]
    game = _start_who(client, premium, "b")
    assert game["status"] == "OPEN" and game["startedBy"] == _id(premium, "b")
    ids = [question["questionId"] for question in game["questions"]]
    assert sorted(ids) == sorted(WHO_OF_US_QUESTION_IDS)
    assert game["turnAccountId"] is None
    again = client.post(_url(premium, "who-of-us"), headers=_headers(premium, "a"))
    assert again.status_code == 409
    assert again.json()["code"] == "COUPLE_GAME_ALREADY_OPEN"


def test_a_partner_answer_stays_hidden_until_the_reader_answered_the_question(
    client, premium
) -> None:  # type: ignore[no-untyped-def]
    game = _start_who(client, premium)
    question = game["questions"][0]["questionId"]
    first = _answer(client, premium, "a", game["id"], question, _id(premium, "b"))
    assert first.status_code == 200, first.text
    mine = first.json()["game"]["questions"][0]
    assert mine["myAnswer"] == _id(premium, "b")
    assert mine["partnerAnswered"] is False and mine["partnerAnswer"] is None

    seen = client.get(_url(premium, "who-of-us"), headers=_headers(premium, "b")).json()["game"]
    theirs = seen["questions"][0]
    assert theirs["partnerAnswered"] is True
    assert theirs["partnerAnswer"] is None and theirs["matches"] is None
    assert seen["partnerAnsweredCount"] == 1 and seen["revealedCount"] == 0

    second = _answer(client, premium, "b", game["id"], question, _id(premium, "b"))
    revealed = second.json()["game"]["questions"][0]
    assert revealed["partnerAnswer"] == _id(premium, "b") and revealed["matches"] is True
    reread = client.get(_url(premium, "who-of-us"), headers=_headers(premium, "a")).json()
    assert reread["game"]["questions"][0]["partnerAnswer"] == _id(premium, "b")
    assert reread["game"]["agreementCount"] == 1


def test_who_of_us_answers_are_validated_and_final(client, premium) -> None:  # type: ignore[no-untyped-def]
    game = _start_who(client, premium)
    question = game["questions"][0]["questionId"]
    unknown = _answer(client, premium, "a", game["id"], "notAQuestion", _id(premium, "a"))
    assert unknown.status_code == 422
    assert unknown.json()["code"] == "WHO_OF_US_UNKNOWN_QUESTION"
    stranger = _answer(client, premium, "a", game["id"], question, str(premium["outsider"].id))
    assert stranger.status_code == 422
    assert stranger.json()["code"] == "WHO_OF_US_ANSWER_NOT_A_PARTNER"
    assert _answer(client, premium, "a", game["id"], question, _id(premium, "a")).status_code == 200
    twice = _answer(client, premium, "a", game["id"], question, _id(premium, "b"))
    assert twice.status_code == 409
    assert twice.json()["code"] == "WHO_OF_US_ALREADY_ANSWERED"
    stale = _answer(client, premium, "a", str(uuid4()), question, _id(premium, "a"))
    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"


def test_who_of_us_sends_one_turn_notice_and_one_result_notice(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    game = _start_who(client, premium)
    questions = [question["questionId"] for question in game["questions"]]
    for question in questions[:-1]:
        _answer(client, premium, "a", game["id"], question, _id(premium, "a"))
    assert _turn_events(session, premium) == []
    done = _answer(client, premium, "a", game["id"], questions[-1], _id(premium, "a")).json()
    assert done["game"]["turnAccountId"] == _id(premium, "b")
    _project(session)
    [turn] = _turn_events(session, premium)
    assert turn.payload.recipient_id == premium["ben"].id
    assert (KIND, "WHO_OF_US_GAME") in _listed_kinds(client, premium, "b")
    assert (KIND, "WHO_OF_US_GAME") not in _listed_kinds(client, premium, "a")

    for question in questions:
        response = _answer(client, premium, "b", game["id"], question, _id(premium, "b"))
        assert response.status_code == 200, response.text
    finished = response.json()["game"]
    assert finished["status"] == "FINISHED" and finished["turnAccountId"] is None
    assert finished["revealedCount"] == len(questions) and finished["agreementCount"] == 0
    _project(session)
    events = _turn_events(session, premium)
    assert [event.payload.recipient_id for event in events] == [
        premium["ben"].id,
        premium["anna"].id,
    ]
    assert (KIND, "WHO_OF_US_GAME") in _listed_kinds(client, premium, "a")
    # Ben's turn notice is no longer current once he answered everything.
    assert (KIND, "WHO_OF_US_GAME") not in _listed_kinds(client, premium, "b")
    notice = session.scalars(
        select(Notification).where(Notification.recipient_account_id == premium["anna"].id)
    ).one()
    assert notice.target_type == "WHO_OF_US_GAME" and notice.target_id == events[0].subject_id


def test_either_partner_may_end_a_game_and_a_new_one_gets_a_new_id(client, premium) -> None:  # type: ignore[no-untyped-def]
    game = _start_who(client, premium)
    question = game["questions"][0]["questionId"]
    ended = client.post(
        _url(premium, "who-of-us", "/end"),
        headers=_headers(premium, "b"),
        json={"gameId": game["id"]},
    )
    assert ended.status_code == 200, ended.text
    assert ended.json()["game"]["status"] == "ENDED"
    assert ended.json()["game"]["endedBy"] == _id(premium, "b")
    late = _answer(client, premium, "a", game["id"], question, _id(premium, "a"))
    assert late.status_code == 409 and late.json()["code"] == "COUPLE_GAME_NOT_OPEN"
    fresh = _start_who(client, premium, "a")
    assert fresh["id"] != game["id"] and fresh["status"] == "OPEN"


# --- Wish detective ----------------------------------------------------------------


def _start_wish(client, couple, who="a"):  # type: ignore[no-untyped-def]
    return client.post(_url(couple, "wish-detective"), headers=_headers(couple, who))


def _clues(client, couple, who, game, clues, round_=None):  # type: ignore[no-untyped-def]
    return client.post(
        _url(couple, "wish-detective", "/clues"),
        headers=_headers(couple, who),
        json={
            "gameId": game["id"],
            "round": game["current"]["round"] if round_ is None else round_,
            "clues": clues,
        },
    )


def _guess(client, couple, who, game, guess=None):  # type: ignore[no-untyped-def]
    body = {"gameId": game["id"], "round": game["current"]["round"]}
    if guess is not None:
        body["guess"] = guess
    return client.post(
        _url(couple, "wish-detective", "/guesses"), headers=_headers(couple, who), json=body
    )


def test_wish_detective_says_who_is_missing_a_wish_without_counts(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    nobody = _start_wish(client, premium)
    assert nobody.status_code == 409
    assert nobody.json()["code"] == "WISH_DETECTIVE_WISHES_MISSING"
    _wish(session, premium, "a", STAR_WISH)
    _wish(session, premium, "b", "Schon erlebt", WishStatus.COMPLETED)
    # A planned wish does not count either (PO 2026-11-18).
    _wish(session, premium, "b", "Schon geplant", WishStatus.PLANNED)
    partner_missing = _start_wish(client, premium, "a")
    assert partner_missing.json()["code"] == "WISH_DETECTIVE_PARTNER_WISH_MISSING"
    own_missing = _start_wish(client, premium, "b")
    assert own_missing.json()["code"] == "WISH_DETECTIVE_OWN_WISH_MISSING"
    state = client.get(_url(premium, "wish-detective"), headers=_headers(premium, "b")).json()
    assert state["readiness"] == {"ownWishesAvailable": False, "partnerWishesAvailable": True}


def test_one_open_wish_each_makes_a_two_round_game(client, session: Session, premium) -> None:  # type: ignore[no-untyped-def]
    anna_wish = _wish(session, premium, "a", STAR_WISH)
    ben_wish = _wish(session, premium, "b", SEA_WISH)
    started = _start_wish(client, premium, "a")
    assert started.status_code == 200, started.text
    game = started.json()["game"]
    assert game["roundsTotal"] == 2 and game["turnAccountId"] == _id(premium, "a")
    current = game["current"]
    assert current["giverId"] == _id(premium, "a") and current["phase"] == "CLUE"
    assert current["wish"] == {"wishId": str(anna_wish.id), "title": STAR_WISH}
    assert current["skipsLeft"] == 3

    # The guesser never receives the wish before the reveal.
    hidden = client.get(_url(premium, "wish-detective"), headers=_headers(premium, "b"))
    assert hidden.json()["game"]["current"]["wish"] is None
    assert "Sternegucken" not in hidden.text and str(anna_wish.id) not in hidden.text

    invalid = _clues(client, premium, "a", game, ["Garten", "Nacht", "Decke"])
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "WISH_DETECTIVE_CLUES_INVALID"
    wrong_player = _clues(client, premium, "b", game, ["Nacht", "Decke", "Warm"])
    assert wrong_player.status_code == 409
    assert wrong_player.json()["code"] == "COUPLE_GAME_NOT_YOUR_TURN"

    given = _clues(client, premium, "a", game, [" Nacht", "Decke", "Warm"])
    assert given.status_code == 200, given.text
    assert given.json()["game"]["turnAccountId"] == _id(premium, "b")
    _project(session)
    assert (KIND, "WISH_DETECTIVE_GAME") in _listed_kinds(client, premium, "b")
    seen = client.get(_url(premium, "wish-detective"), headers=_headers(premium, "b"))
    guessing = seen.json()["game"]
    assert guessing["current"]["phase"] == "GUESS"
    assert guessing["current"]["clues"] == ["Nacht", "Decke", "Warm"]
    assert "Sternegucken" not in seen.text

    guessed = _guess(client, premium, "b", guessing, "sternegucken garten")
    assert guessed.status_code == 200, guessed.text
    after = guessed.json()["game"]
    [reveal] = after["revealed"]
    assert reveal["result"] == "CORRECT" and reveal["guess"] == "sternegucken garten"
    assert reveal["wish"]["title"] == STAR_WISH
    # Roles swap: Ben gives next, with his own (planned) wish; no notice to himself.
    assert after["current"]["giverId"] == _id(premium, "b")
    assert after["current"]["wish"]["wishId"] == str(ben_wish.id)
    assert after["turnAccountId"] == _id(premium, "b")
    assert len(_turn_events(session, premium)) == 1

    anna_view = client.get(_url(premium, "wish-detective"), headers=_headers(premium, "a"))
    assert anna_view.json()["game"]["revealed"][0]["result"] == "CORRECT"
    assert anna_view.json()["game"]["current"]["wish"] is None
    assert "Wochenende" not in anna_view.text

    round_two = after
    assert _clues(client, premium, "b", round_two, ["Strand", "Sonne", "Wellen"]).status_code == 200
    passed = _guess(client, premium, "a", round_two)
    finished = passed.json()["game"]
    assert finished["status"] == "FINISHED" and finished["current"] is None
    assert [entry["result"] for entry in finished["revealed"]] == ["CORRECT", "PASSED"]
    assert {score["accountId"]: score["correctGuesses"] for score in finished["scores"]} == {
        _id(premium, "a"): 0,
        _id(premium, "b"): 1,
    }
    _project(session)
    recipients = [event.payload.recipient_id for event in _turn_events(session, premium)]
    assert recipients == [premium["ben"].id, premium["anna"].id, premium["ben"].id]
    assert (KIND, "WISH_DETECTIVE_GAME") in _listed_kinds(client, premium, "b")
    assert (KIND, "WISH_DETECTIVE_GAME") not in _listed_kinds(client, premium, "a")


def test_rounds_are_capped_and_balanced(client, session: Session, premium) -> None:  # type: ignore[no-untyped-def]
    for index in range(6):
        _wish(session, premium, "a", f"Anna Wunsch {index}")
    for index in range(3):
        _wish(session, premium, "b", f"Ben Wunsch {index}")
    assert _start_wish(client, premium).json()["game"]["roundsTotal"] == 6


def test_the_giver_may_skip_three_times_per_round(client, session: Session, premium) -> None:  # type: ignore[no-untyped-def]
    for index in range(6):
        _wish(session, premium, "a", f"Anna Wunsch {index}")
    _wish(session, premium, "b", "Ben Wunsch")
    game = _start_wish(client, premium).json()["game"]
    seen = {game["current"]["wish"]["wishId"]}
    for left in (2, 1, 0):
        skipped = client.post(
            _url(premium, "wish-detective", "/skip"),
            headers=_headers(premium),
            json={"gameId": game["id"], "round": 0},
        )
        assert skipped.status_code == 200, skipped.text
        current = skipped.json()["game"]["current"]
        assert current["skipsLeft"] == left
        assert current["wish"]["wishId"] not in seen
        seen.add(current["wish"]["wishId"])
    exhausted = client.post(
        _url(premium, "wish-detective", "/skip"),
        headers=_headers(premium),
        json={"gameId": game["id"], "round": 0},
    )
    assert exhausted.status_code == 409
    assert exhausted.json()["code"] == "WISH_DETECTIVE_NO_SKIPS_LEFT"


def test_skipping_needs_another_wish_and_a_vanished_wish_voids_the_round(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    anna_wish = _wish(session, premium, "a", STAR_WISH)
    _wish(session, premium, "b", SEA_WISH)
    game = _start_wish(client, premium).json()["game"]
    lonely = client.post(
        _url(premium, "wish-detective", "/skip"),
        headers=_headers(premium),
        json={"gameId": game["id"], "round": 0},
    )
    assert lonely.status_code == 409
    assert lonely.json()["code"] == "WISH_DETECTIVE_NO_OTHER_WISH"
    assert _clues(client, premium, "a", game, ["Nacht", "Decke", "Warm"]).status_code == 200
    stale = _clues(client, premium, "a", game, ["Nacht", "Decke", "Warm"])
    assert stale.status_code == 409 and stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"
    session.delete(anna_wish)
    session.flush()
    voided = _guess(client, premium, "b", game, STAR_WISH)
    assert voided.status_code == 200, voided.text
    [reveal] = voided.json()["game"]["revealed"]
    assert reveal["result"] == "VOID" and reveal["wish"] is None


# --- Our moments -------------------------------------------------------------------


def _board(session: Session, game_id: str) -> list[tuple[str, str]]:
    game = session.get(CoupleGame, game_id)
    assert game is not None and game.payload.our_moments is not None
    return [(str(card.memory_id), card.face) for card in game.payload.our_moments.cards]


def _flip(client, couple, who, game, position):  # type: ignore[no-untyped-def]
    return client.post(
        _url(couple, "our-moments", "/flips"),
        headers=_headers(couple, who),
        json={"gameId": game["id"], "flipsDone": game["flipsDone"], "position": position},
    )


def test_our_moments_needs_three_photo_moments_both_partners_may_read(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _photo_memory(session, premium, "Erster Ausflug")
    _photo_memory(session, premium, "Sommerfest")
    # A moment without a photo is not a playable card.
    _photo_memory(session, premium, "Ohne Foto", with_photo=False)
    response = client.post(_url(premium, "our-moments"), headers=_headers(premium))
    assert response.status_code == 409
    assert response.json()["code"] == "OUR_MOMENTS_MOMENTS_MISSING"


def test_our_moments_reveals_only_flipped_cards_and_a_miss_hands_over(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    for title in ("Erster Ausflug", "Sommerfest", "Hochzeit", "Umzug", "Winterwald"):
        _photo_memory(session, premium, title)
    started = client.post(_url(premium, "our-moments"), headers=_headers(premium))
    assert started.status_code == 200, started.text
    game = started.json()["game"]
    assert game["totalPairs"] == 4 and len(game["cards"]) == 8
    assert game["turnAccountId"] == _id(premium, "a")
    assert all(card["state"] == "HIDDEN" and card["moment"] is None for card in game["cards"])
    board = _board(session, game["id"])
    for memory_id, _face in board:
        assert memory_id not in started.text

    first = 0
    miss = next(index for index, card in enumerate(board) if card[0] != board[first][0])
    waiting = _flip(client, premium, "b", game, first)
    assert waiting.status_code == 409 and waiting.json()["code"] == "COUPLE_GAME_NOT_YOUR_TURN"
    one = _flip(client, premium, "a", game, first).json()["game"]
    assert one["cards"][first]["state"] == "REVEALED"
    assert one["cards"][first]["moment"]["memoryId"] == board[first][0]
    assert sum(1 for card in one["cards"] if card["moment"] is not None) == 1
    same = _flip(client, premium, "a", one, first)
    assert same.status_code == 422 and same.json()["code"] == "OUR_MOMENTS_CARD_NOT_FLIPPABLE"
    stale = _flip(client, premium, "a", game, miss)
    assert stale.status_code == 409 and stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    two = _flip(client, premium, "a", one, miss).json()["game"]
    assert two["turnAccountId"] == _id(premium, "b")
    assert all(card["state"] == "HIDDEN" for card in two["cards"])
    assert two["lastTurn"]["playerId"] == _id(premium, "a")
    assert two["lastTurn"]["matched"] is False
    assert [card["position"] for card in two["lastTurn"]["cards"]] == [first, miss]
    assert all(card["moment"]["title"] for card in two["lastTurn"]["cards"])
    _project(session)
    assert (KIND, "OUR_MOMENTS_GAME") in _listed_kinds(client, premium, "b")


def test_a_found_pair_keeps_the_turn_and_the_last_pair_finishes(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    for title in ("Erster Ausflug", "Sommerfest", "Hochzeit"):
        _photo_memory(session, premium, title)
    game = client.post(_url(premium, "our-moments"), headers=_headers(premium)).json()["game"]
    assert game["totalPairs"] == 3
    board = _board(session, game["id"])
    pairs: dict[str, list[int]] = {}
    for index, (memory_id, _face) in enumerate(board):
        pairs.setdefault(memory_id, []).append(index)
    for count, positions in enumerate(pairs.values(), start=1):
        game = _flip(client, premium, "a", game, positions[0]).json()["game"]
        response = _flip(client, premium, "a", game, positions[1])
        assert response.status_code == 200, response.text
        game = response.json()["game"]
        assert game["matchedPairs"] == count
        assert game["lastTurn"]["matched"] is True
        assert all(game["cards"][position]["state"] == "MATCHED" for position in positions)
    assert game["status"] == "FINISHED" and game["turnAccountId"] is None
    assert {score["accountId"]: score["pairs"] for score in game["scores"]} == {
        _id(premium, "a"): 3,
        _id(premium, "b"): 0,
    }
    _project(session)
    [finished] = _turn_events(session, premium)
    assert finished.payload.recipient_id == premium["ben"].id
    assert (KIND, "OUR_MOMENTS_GAME") in _listed_kinds(client, premium, "b")


# --- lifecycle and data minimisation ------------------------------------------------


def test_games_are_dropped_when_the_couple_changes(client, session: Session, premium) -> None:  # type: ignore[no-untyped-def]
    _start_who(client, premium)
    membership = relationship_service.require_membership(
        session, premium["ben"], premium["space"].id
    )
    relationship_service.end_membership(session, membership)
    session.flush()
    assert session.scalar(select(CoupleGame.id)) is None


def test_stored_row_keeps_content_in_the_protected_payload(
    client, session: Session, premium
) -> None:  # type: ignore[no-untyped-def]
    _start_who(client, premium)
    columns = {
        row[0]
        for row in session.execute(
            text(
                "SELECT column_name FROM information_schema.columns"
                " WHERE table_name = 'couple_games'"
            )
        )
    }
    assert columns == {
        "id",
        "space_id",
        "game",
        "status",
        "started_by",
        "ended_by",
        "waiting_on_id",
        "crypto_version",
        "payload",
        "version",
        "created_at",
        "updated_at",
    }
