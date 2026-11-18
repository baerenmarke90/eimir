"""Authoritative state, reveal rules and hand-over notices for remote rounds.

Who of us: both partners answer the same server-chosen questions on their own
devices. A partner's answer to a question becomes readable to the other only
after the other answered that question too. When one partner has answered
everything, the other gets one "your turn" notice; when the second partner
finishes, the first gets one notice that the result is there.

Wish detective: rounds alternate between the partners as giver and guesser.
The server draws the giver's wish from their own readable OPEN or PLANNED
wishes, validates the three clues exactly like the client, hides the wish
from the guesser until the reveal and judges the guess. There are no timers,
streaks or penalties: an open game simply waits.

Our moments: the server fixes a shuffled board of Memory pairs that both
partners may read. The partner whose turn it is flips two cards; a found pair
keeps the turn, a miss hands it over with a notice. A card's Memory reference
is only part of a response once the card was flipped.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, date
from uuid import UUID

from sqlalchemy import Select, delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.couple_games import wish_detective_rules as rules
from eimir.couple_games.models import (
    OUR_MOMENTS_MAX_PAIRS,
    OUR_MOMENTS_MIN_PAIRS,
    WHO_OF_US_QUESTION_IDS,
    WISH_DETECTIVE_CLUE_COUNT,
    WISH_DETECTIVE_MAX_ROUNDS_PER_PARTNER,
    WISH_DETECTIVE_MIN_ROUNDS_PER_PARTNER,
    WISH_DETECTIVE_SKIPS_PER_ROUND,
    CoupleGame,
    CoupleGameKind,
    CoupleGamePayload,
    CoupleGameStatus,
    OurMomentsCard,
    OurMomentsData,
    OurMomentsTurn,
    WhoOfUsData,
    WishDetectiveData,
    WishDetectivePhase,
    WishDetectiveResult,
    WishDetectiveRound,
)
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.games.service import MemoryCandidate, read_memory_candidates
from eimir.memories.models import Memory
from eimir.outbox import service as outbox_service
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus
from eimir.wishes.models import Wish, WishStatus

# A wish that became a plan is still the person's wish (#1907 follow-up).
CANDIDATE_WISH_STATUSES = (WishStatus.OPEN.value, WishStatus.PLANNED.value)
# Bounded scan per draw; the game uses at most four wishes per partner.
_MAX_DRAW_POOL = 64

SUBJECT_TYPES = {
    CoupleGameKind.WHO_OF_US: "who_of_us_game",
    CoupleGameKind.WISH_DETECTIVE: "wish_detective_game",
    CoupleGameKind.OUR_MOMENTS: "our_moments_game",
}

_random = random.SystemRandom()


class CoupleGameErrorCode:
    COUPLE_REQUIRED = "COUPLE_GAME_COUPLE_REQUIRED"
    ALREADY_OPEN = "COUPLE_GAME_ALREADY_OPEN"
    NOT_OPEN = "COUPLE_GAME_NOT_OPEN"
    NOT_YOUR_TURN = "COUPLE_GAME_NOT_YOUR_TURN"
    UNKNOWN_QUESTION = "WHO_OF_US_UNKNOWN_QUESTION"
    NOT_A_PARTNER = "WHO_OF_US_ANSWER_NOT_A_PARTNER"
    ALREADY_ANSWERED = "WHO_OF_US_ALREADY_ANSWERED"
    WISHES_MISSING = "WISH_DETECTIVE_WISHES_MISSING"
    OWN_WISH_MISSING = "WISH_DETECTIVE_OWN_WISH_MISSING"
    PARTNER_WISH_MISSING = "WISH_DETECTIVE_PARTNER_WISH_MISSING"
    NO_SKIPS_LEFT = "WISH_DETECTIVE_NO_SKIPS_LEFT"
    NO_OTHER_WISH = "WISH_DETECTIVE_NO_OTHER_WISH"
    WISH_UNAVAILABLE = "WISH_DETECTIVE_WISH_UNAVAILABLE"
    CLUES_INVALID = "WISH_DETECTIVE_CLUES_INVALID"
    GUESS_REQUIRED = "WISH_DETECTIVE_GUESS_REQUIRED"
    MOMENTS_MISSING = "OUR_MOMENTS_MOMENTS_MISSING"
    CARD_NOT_FLIPPABLE = "OUR_MOMENTS_CARD_NOT_FLIPPABLE"


def _stale() -> ConflictError:
    return ConflictError(
        "The game changed. Reload it before trying again.",
        ErrorCode.RESOURCE_VERSION_CONFLICT,
    )


def _members(session: Session, space_id: UUID) -> list[UUID]:
    return list(
        session.scalars(
            select(Membership.account_id)
            .where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Membership.id)
        )
    )


def other_member(session: Session, context: AuthorizationContext) -> UUID | None:
    return next(
        (member for member in _members(session, context.space_id) if member != context.account_id),
        None,
    )


def partner_of(session: Session, context: AuthorizationContext) -> UUID:
    members = _members(session, context.space_id)
    others = [member for member in members if member != context.account_id]
    if context.account_id not in members or len(members) != 2 or len(others) != 1:
        raise ConflictError(
            "This game needs exactly two partners in the Space.",
            CoupleGameErrorCode.COUPLE_REQUIRED,
        )
    return others[0]


def get_game(
    session: Session, context: AuthorizationContext, kind: CoupleGameKind
) -> CoupleGame | None:
    return session.scalar(
        select(CoupleGame).where(
            CoupleGame.space_id == context.space_id, CoupleGame.game == kind.value
        )
    )


def _current(
    session: Session, context: AuthorizationContext, kind: CoupleGameKind, game_id: UUID
) -> CoupleGame:
    game = get_game(session, context, kind)
    if game is None or game.id != game_id:
        raise _stale()
    if game.status != CoupleGameStatus.OPEN.value:
        raise ConflictError("The game is over.", CoupleGameErrorCode.NOT_OPEN)
    return game


def _clear_for_new_game(
    session: Session, context: AuthorizationContext, kind: CoupleGameKind
) -> None:
    previous = get_game(session, context, kind)
    if previous is None:
        return
    if previous.status == CoupleGameStatus.OPEN.value:
        raise ConflictError(
            "A game is still open. Finish or end it before starting a new one.",
            CoupleGameErrorCode.ALREADY_OPEN,
        )
    # A new game gets a new id, so notices about the previous one go stale.
    session.delete(previous)
    session.flush()


def _notify(
    session: Session,
    context: AuthorizationContext,
    game: CoupleGame,
    recipient: UUID,
) -> None:
    outbox_service.record(
        session,
        DomainEvent(
            type=EventType.COUPLE_GAME_TURN,
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type=SUBJECT_TYPES[CoupleGameKind(game.game)],
            subject_id=game.id,
            resource_version=game.version,
            payload=PublicEventPayload(recipient_id=recipient),
        ),
    )


def notice_is_current(
    context: AuthorizationContext, target_id: object, kind: CoupleGameKind
) -> Select[tuple[UUID]]:
    """A game notice is current while the game still waits on the reader."""
    return select(CoupleGame.id).where(
        CoupleGame.id == target_id,
        CoupleGame.space_id == context.space_id,
        CoupleGame.game == kind.value,
        CoupleGame.waiting_on_id == context.account_id,
        CoupleGame.status.in_((CoupleGameStatus.OPEN.value, CoupleGameStatus.FINISHED.value)),
    )


def end_game(
    session: Session, context: AuthorizationContext, kind: CoupleGameKind, *, game_id: UUID
) -> CoupleGame:
    """Either partner may end an open game; what was played stays readable."""
    relationship.lock_space(session, context.space_id)
    partner_of(session, context)
    game = _current(session, context, kind, game_id)
    game.status = CoupleGameStatus.ENDED.value
    game.ended_by = context.account_id
    game.waiting_on_id = None
    session.flush()
    return game


def purge_space(session: Session, space_id: UUID) -> None:
    """Drop the remote games when the couple changes; wishes stay untouched."""
    session.execute(delete(CoupleGame).where(CoupleGame.space_id == space_id))
    session.flush()


# --- Who of us ------------------------------------------------------------------


def start_who_of_us(session: Session, context: AuthorizationContext) -> CoupleGame:
    relationship.lock_space(session, context.space_id)
    partner_of(session, context)
    _clear_for_new_game(session, context, CoupleGameKind.WHO_OF_US)
    questions = list(WHO_OF_US_QUESTION_IDS)
    _random.shuffle(questions)
    game = CoupleGame(
        space_id=context.space_id,
        game=CoupleGameKind.WHO_OF_US.value,
        status=CoupleGameStatus.OPEN.value,
        started_by=context.account_id,
        waiting_on_id=None,
        payload=CoupleGamePayload(who_of_us=WhoOfUsData(question_ids=questions, answers={})),
    )
    session.add(game)
    session.flush()
    return game


def answer_who_of_us(
    session: Session,
    context: AuthorizationContext,
    *,
    game_id: UUID,
    question_id: str,
    partner_id: UUID,
) -> CoupleGame:
    """Record which partner one question applies to, in the reader's own view."""
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    game = _current(session, context, CoupleGameKind.WHO_OF_US, game_id)
    data = game.payload.who_of_us
    if data is None:
        raise _stale()
    if question_id not in data.question_ids:
        raise ValidationError(
            "The question is not part of this game.", CoupleGameErrorCode.UNKNOWN_QUESTION
        )
    if partner_id not in {context.account_id, partner}:
        raise ValidationError(
            "An answer names one of the two partners.", CoupleGameErrorCode.NOT_A_PARTNER
        )
    mine = data.answers.get(context.account_id, {})
    if question_id in mine:
        raise ConflictError(
            "This question is already answered.", CoupleGameErrorCode.ALREADY_ANSWERED
        )
    answers = {**data.answers, context.account_id: {**mine, question_id: partner_id}}
    game.payload = CoupleGamePayload(
        who_of_us=WhoOfUsData(question_ids=list(data.question_ids), answers=answers)
    )
    total = len(data.question_ids)
    i_am_done = len(answers[context.account_id]) == total
    partner_done = len(answers.get(partner, {})) == total
    notify = False
    if i_am_done and partner_done:
        game.status = CoupleGameStatus.FINISHED.value
        game.waiting_on_id = partner
        notify = True
    elif i_am_done:
        # Exactly once per game: answers cannot be withdrawn.
        game.waiting_on_id = partner
        notify = True
    session.flush()
    if notify:
        _notify(session, context, game, partner)
    return game


# --- Wish detective ---------------------------------------------------------------


@dataclass(frozen=True)
class WishReadiness:
    own_wishes_available: bool
    partner_wishes_available: bool


def _candidate_ids(
    session: Session, space_id: UUID, owner_id: UUID, *, limit: int = _MAX_DRAW_POOL
) -> list[UUID]:
    """The owner's own readable OPEN or PLANNED wishes with a title.

    The owner's authorization context is used, like ``read_wish_candidates``
    does for the reader; wishes are Space-shared, so the guesser can read the
    same wish at the reveal.
    """
    owner = AuthorizationContext(account_id=owner_id, space_id=space_id)
    statement = (
        readable(Wish, owner)
        .where(Wish.status.in_(CANDIDATE_WISH_STATUSES), Wish.owner_id == owner_id)
        .order_by(Wish.created_at.desc(), Wish.id.desc())
    )
    found: list[UUID] = []
    for wish in session.execute(statement).scalars().yield_per(100):
        if wish.payload.title.strip():
            found.append(wish.id)
            if len(found) >= limit:
                break
    return found


def readiness(session: Session, context: AuthorizationContext) -> WishReadiness:
    """Whether each partner has at least one wish to play; never a count."""
    partner = other_member(session, context)
    return WishReadiness(
        own_wishes_available=bool(
            _candidate_ids(session, context.space_id, context.account_id, limit=1)
        ),
        partner_wishes_available=partner is not None
        and bool(_candidate_ids(session, context.space_id, partner, limit=1)),
    )


def wish_titles(
    session: Session, context: AuthorizationContext, wish_ids: set[UUID]
) -> dict[UUID, str]:
    """Live titles of the wishes the reader may read (any status)."""
    if not wish_ids:
        return {}
    return {
        wish.id: wish.payload.title.strip()
        for wish in session.scalars(readable(Wish, context).where(Wish.id.in_(wish_ids)))
    }


def phase_of(round_: WishDetectiveRound) -> WishDetectivePhase | None:
    if round_.result is not None:
        return None
    return WishDetectivePhase.GUESS if round_.clues else WishDetectivePhase.CLUE


def _draw(
    session: Session,
    space_id: UUID,
    giver_id: UUID,
    data: WishDetectiveData,
    *,
    exclude: UUID | None = None,
) -> UUID | None:
    pool = [wish for wish in _candidate_ids(session, space_id, giver_id) if wish != exclude]
    drawn = set(data.drawn_wish_ids)
    fresh = [wish for wish in pool if wish not in drawn]
    if fresh:
        return _random.choice(fresh)
    # Only skipped wishes are left: they may come back, a played one never.
    played = {round_.wish_id for round_ in data.rounds if round_.result is not None}
    skipped = [wish for wish in pool if wish not in played]
    return _random.choice(skipped) if skipped else None


def start_wish_detective(session: Session, context: AuthorizationContext) -> CoupleGame:
    """Open a game; the partner who opens it gives the first clues."""
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    existing = get_game(session, context, CoupleGameKind.WISH_DETECTIVE)
    if existing is not None and existing.status == CoupleGameStatus.OPEN.value:
        raise ConflictError(
            "A game is still open. Finish or end it before starting a new one.",
            CoupleGameErrorCode.ALREADY_OPEN,
        )
    limit = WISH_DETECTIVE_MAX_ROUNDS_PER_PARTNER
    mine = _candidate_ids(session, context.space_id, context.account_id)
    theirs = _candidate_ids(session, context.space_id, partner, limit=limit)
    per_partner = min(len(mine), len(theirs), limit)
    if per_partner < WISH_DETECTIVE_MIN_ROUNDS_PER_PARTNER:
        code = (
            CoupleGameErrorCode.WISHES_MISSING
            if not mine and not theirs
            else CoupleGameErrorCode.OWN_WISH_MISSING
            if not mine
            else CoupleGameErrorCode.PARTNER_WISH_MISSING
        )
        raise ConflictError("Each partner needs at least one wish to play.", code)
    _clear_for_new_game(session, context, CoupleGameKind.WISH_DETECTIVE)
    first = _random.choice(mine)
    game = CoupleGame(
        space_id=context.space_id,
        game=CoupleGameKind.WISH_DETECTIVE.value,
        status=CoupleGameStatus.OPEN.value,
        started_by=context.account_id,
        waiting_on_id=context.account_id,
        payload=CoupleGamePayload(
            wish_detective=WishDetectiveData(
                rounds_total=2 * per_partner,
                rounds=[WishDetectiveRound(giver_id=context.account_id, wish_id=first)],
                drawn_wish_ids=[first],
            )
        ),
    )
    session.add(game)
    session.flush()
    return game


def _open_round(
    session: Session,
    context: AuthorizationContext,
    *,
    game_id: UUID,
    round_index: int,
    phase: WishDetectivePhase,
) -> tuple[CoupleGame, WishDetectiveData, WishDetectiveRound]:
    game = _current(session, context, CoupleGameKind.WISH_DETECTIVE, game_id)
    data = game.payload.wish_detective
    if data is None or not data.rounds or len(data.rounds) - 1 != round_index:
        raise _stale()
    current = data.rounds[-1]
    if phase_of(current) is not phase:
        raise _stale()
    giving = current.giver_id == context.account_id
    if giving != (phase is WishDetectivePhase.CLUE):
        raise ConflictError("It is not your turn.", CoupleGameErrorCode.NOT_YOUR_TURN)
    return game, data, current


def _store(
    game: CoupleGame,
    data: WishDetectiveData,
    rounds: list[WishDetectiveRound],
    *,
    rounds_total: int | None = None,
    drawn: list[UUID] | None = None,
) -> None:
    game.payload = CoupleGamePayload(
        wish_detective=WishDetectiveData(
            rounds_total=data.rounds_total if rounds_total is None else rounds_total,
            rounds=rounds,
            drawn_wish_ids=list(data.drawn_wish_ids) if drawn is None else drawn,
        )
    )


def _finish_early(
    session: Session,
    context: AuthorizationContext,
    game: CoupleGame,
    data: WishDetectiveData,
    played: list[WishDetectiveRound],
    partner: UUID,
) -> None:
    """No wish is left for the next giver: the game ends with what was played."""
    _store(game, data, played, rounds_total=len(played))
    game.status = CoupleGameStatus.FINISHED.value
    game.waiting_on_id = partner if played else None
    session.flush()
    if played:
        _notify(session, context, game, partner)


def skip_wish(
    session: Session, context: AuthorizationContext, *, game_id: UUID, round_index: int
) -> CoupleGame:
    """Draw another of the giver's wishes; free when the current one vanished."""
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    game, data, current = _open_round(
        session,
        context,
        game_id=game_id,
        round_index=round_index,
        phase=WishDetectivePhase.CLUE,
    )
    available = current.wish_id in wish_titles(session, context, {current.wish_id})
    if available and current.skips >= WISH_DETECTIVE_SKIPS_PER_ROUND:
        raise ConflictError(
            "No more wishes can be skipped in this round.", CoupleGameErrorCode.NO_SKIPS_LEFT
        )
    replacement = _draw(
        session, context.space_id, context.account_id, data, exclude=current.wish_id
    )
    if replacement is None:
        if available:
            raise ConflictError(
                "There is no other wish to draw.", CoupleGameErrorCode.NO_OTHER_WISH
            )
        _finish_early(session, context, game, data, data.rounds[:-1], partner)
        return game
    rounds = [
        *data.rounds[:-1],
        WishDetectiveRound(
            giver_id=current.giver_id,
            wish_id=replacement,
            skips=current.skips + (1 if available else 0),
        ),
    ]
    drawn = [*data.drawn_wish_ids, *([] if replacement in data.drawn_wish_ids else [replacement])]
    _store(game, data, rounds, drawn=drawn)
    session.flush()
    return game


def submit_clues(
    session: Session,
    context: AuthorizationContext,
    *,
    game_id: UUID,
    round_index: int,
    clues: list[str],
) -> CoupleGame:
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    game, data, current = _open_round(
        session,
        context,
        game_id=game_id,
        round_index=round_index,
        phase=WishDetectivePhase.CLUE,
    )
    title = wish_titles(session, context, {current.wish_id}).get(current.wish_id)
    if not title:
        raise ConflictError(
            "The wish is no longer available. Draw another one.",
            CoupleGameErrorCode.WISH_UNAVAILABLE,
        )
    if len(clues) != WISH_DETECTIVE_CLUE_COUNT or any(rules.validate_clues(clues, title)):
        raise ValidationError(
            "Each clue is one new word that is not part of the wish.",
            CoupleGameErrorCode.CLUES_INVALID,
        )
    rounds = [
        *data.rounds[:-1],
        current.model_copy(update={"clues": [rules.display_clue(clue) for clue in clues]}),
    ]
    _store(game, data, rounds)
    game.waiting_on_id = partner
    session.flush()
    _notify(session, context, game, partner)
    return game


def guess_wish(
    session: Session,
    context: AuthorizationContext,
    *,
    game_id: UUID,
    round_index: int,
    guess: str | None,
) -> CoupleGame:
    """Judge a guess (``None`` passes), reveal the round and hand the next one on."""
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    game, data, current = _open_round(
        session,
        context,
        game_id=game_id,
        round_index=round_index,
        phase=WishDetectivePhase.GUESS,
    )
    cleaned = rules.display_clue(guess) if guess is not None else None
    if cleaned is not None and not cleaned:
        raise ValidationError("A guess cannot be empty.", CoupleGameErrorCode.GUESS_REQUIRED)
    title = wish_titles(session, context, {current.wish_id}).get(current.wish_id)
    if not title:
        result = WishDetectiveResult.VOID
    elif cleaned is None:
        result = WishDetectiveResult.PASSED
    elif rules.is_guess_correct(cleaned, title):
        result = WishDetectiveResult.CORRECT
    else:
        result = WishDetectiveResult.INCORRECT
    played = [
        *data.rounds[:-1],
        current.model_copy(update={"guess": cleaned, "result": result}),
    ]
    if len(played) >= data.rounds_total:
        _store(game, data, played)
        game.status = CoupleGameStatus.FINISHED.value
        game.waiting_on_id = partner
        session.flush()
        _notify(session, context, game, partner)
        return game
    # The guesser gives the next clues; they are already here, so no notice.
    _store(game, data, played)
    revealed = game.payload.wish_detective
    following = _draw(session, context.space_id, context.account_id, revealed) if revealed else None
    if following is None:
        _finish_early(session, context, game, data, played, partner)
        return game
    drawn = [*data.drawn_wish_ids, *([] if following in data.drawn_wish_ids else [following])]
    _store(
        game,
        data,
        [*played, WishDetectiveRound(giver_id=context.account_id, wish_id=following)],
        drawn=drawn,
    )
    game.waiting_on_id = context.account_id
    session.flush()
    return game


# --- Our moments -----------------------------------------------------------------


def _shared_memory_candidates(
    session: Session, space_id: UUID, first: UUID, second: UUID
) -> list[MemoryCandidate]:
    """Photo Memories both partners may read, with the first partner's image choice."""
    mine = read_memory_candidates(
        session, AuthorizationContext(account_id=first, space_id=space_id)
    )
    theirs = {
        candidate.memory_id
        for candidate in read_memory_candidates(
            session, AuthorizationContext(account_id=second, space_id=space_id)
        )
    }
    return [candidate for candidate in mine if candidate.memory_id in theirs]


def start_our_moments(session: Session, context: AuthorizationContext) -> CoupleGame:
    """Fix a shuffled board of three or four Memory pairs; the opener flips first."""
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    existing = get_game(session, context, CoupleGameKind.OUR_MOMENTS)
    if existing is not None and existing.status == CoupleGameStatus.OPEN.value:
        raise ConflictError(
            "A game is still open. Finish or end it before starting a new one.",
            CoupleGameErrorCode.ALREADY_OPEN,
        )
    candidates = _shared_memory_candidates(session, context.space_id, context.account_id, partner)
    if len(candidates) < OUR_MOMENTS_MIN_PAIRS:
        raise ConflictError(
            "At least three shared photo moments are needed.",
            CoupleGameErrorCode.MOMENTS_MISSING,
        )
    pair_count = OUR_MOMENTS_MAX_PAIRS if len(candidates) >= OUR_MOMENTS_MAX_PAIRS else 3
    chosen = _random.sample(candidates, pair_count)
    cards = [
        OurMomentsCard(
            memory_id=candidate.memory_id,
            attachment_id=candidate.image_attachment_id,
            face=face,
        )
        for candidate in chosen
        for face in ("PHOTO", "CONTEXT")
    ]
    _random.shuffle(cards)
    _clear_for_new_game(session, context, CoupleGameKind.OUR_MOMENTS)
    game = CoupleGame(
        space_id=context.space_id,
        game=CoupleGameKind.OUR_MOMENTS.value,
        status=CoupleGameStatus.OPEN.value,
        started_by=context.account_id,
        waiting_on_id=context.account_id,
        payload=CoupleGamePayload(
            our_moments=OurMomentsData(cards=cards, scores={context.account_id: 0, partner: 0})
        ),
    )
    session.add(game)
    session.flush()
    return game


def flip_card(
    session: Session,
    context: AuthorizationContext,
    *,
    game_id: UUID,
    flips_done: int,
    position: int,
) -> CoupleGame:
    """Flip one card; the second flip of a turn judges the pair.

    As in the local game, a found pair keeps the turn and a miss hands it to
    the partner (with a notice). The last pair finishes the game.
    """
    relationship.lock_space(session, context.space_id)
    partner = partner_of(session, context)
    game = _current(session, context, CoupleGameKind.OUR_MOMENTS, game_id)
    data = game.payload.our_moments
    if data is None or data.flips_done != flips_done:
        raise _stale()
    if game.waiting_on_id != context.account_id:
        raise ConflictError("It is not your turn.", CoupleGameErrorCode.NOT_YOUR_TURN)
    if not 0 <= position < len(data.cards) or position in data.matched or position in data.flipped:
        raise ValidationError(
            "This card cannot be flipped.", CoupleGameErrorCode.CARD_NOT_FLIPPABLE
        )
    update: dict[str, object] = {"flips_done": data.flips_done + 1}
    notify = False
    if not data.flipped:
        update["flipped"] = [position]
    else:
        first = data.flipped[0]
        matched = data.cards[first].memory_id == data.cards[position].memory_id
        update["flipped"] = []
        update["last_turn"] = OurMomentsTurn(
            player_id=context.account_id, positions=[first, position], matched=matched
        )
        if matched:
            update["matched"] = [*data.matched, first, position]
            update["scores"] = {
                **data.scores,
                context.account_id: data.scores.get(context.account_id, 0) + 1,
            }
            if len(data.matched) + 2 >= len(data.cards):
                game.status = CoupleGameStatus.FINISHED.value
                game.waiting_on_id = partner
                notify = True
        else:
            game.waiting_on_id = partner
            notify = True
    game.payload = CoupleGamePayload(our_moments=data.model_copy(update=update))
    session.flush()
    if notify:
        _notify(session, context, game, partner)
    return game


@dataclass(frozen=True)
class MomentFace:
    memory_id: UUID
    title: str
    effective_date: date


def moment_faces(
    session: Session, context: AuthorizationContext, memory_ids: set[UUID]
) -> dict[UUID, MomentFace]:
    """Live title and date of the Memories the reader may read."""
    if not memory_ids:
        return {}
    faces: dict[UUID, MomentFace] = {}
    for memory in session.scalars(readable(Memory, context).where(Memory.id.in_(memory_ids))):
        created_at = memory.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        faces[memory.id] = MomentFace(
            memory_id=memory.id,
            title=memory.payload.title.strip(),
            effective_date=memory.happened_on or created_at.astimezone(UTC).date(),
        )
    return faces
