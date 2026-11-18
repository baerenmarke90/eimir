"""Premium-protected remote rounds for Who of us, Wish detective and Our moments.

Each partner plays on their own device. Every route resolves authentication and
Space membership first and then asks the central entitlement authority for
``games.couple``, exactly like picture ping-pong. A response is always built
for the reading partner: an answer of the other partner appears only after the
reader answered the same question, and a wish stays hidden from the guesser
until the round is revealed.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.authorization import AuthorizationContext
from eimir.couple_games import service
from eimir.couple_games.models import (
    OUR_MOMENTS_MAX_PAIRS,
    WISH_DETECTIVE_CLUE_COUNT,
    WISH_DETECTIVE_MAX_CLUE_INPUT,
    WISH_DETECTIVE_MAX_GUESS_LENGTH,
    WISH_DETECTIVE_MAX_ROUNDS_PER_PARTNER,
    WISH_DETECTIVE_SKIPS_PER_ROUND,
    CoupleGame,
    CoupleGameKind,
    CoupleGameStatus,
    WishDetectivePhase,
    WishDetectiveResult,
)
from eimir.entitlements.models import Capability

router = APIRouter(tags=["games"])

_WHO_OF_US = "/spaces/{spaceId}/games/who-of-us"
_WISH_DETECTIVE = "/spaces/{spaceId}/games/wish-detective"
_OUR_MOMENTS = "/spaces/{spaceId}/games/our-moments"
_MAX_ROUND_INDEX = 2 * WISH_DETECTIVE_MAX_ROUNDS_PER_PARTNER - 1


# --- shared ----------------------------------------------------------------------


class CoupleGameEndInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    game_id: UUID = Field(description="The game this client saw; another id is a conflict.")


def _ensure_games(session: DbSession, authorization: Authorization, *, write: bool) -> None:
    ensure_capability(
        session,
        authorization.space_id,
        Capability.GAMES_COUPLE.value,
        lock_grants=write,
    )


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


def _other_partner(session: DbSession, context: AuthorizationContext, game: CoupleGame) -> UUID:
    """The second player of a game; games are purged whenever the couple changes."""
    return service.other_member(session, context) or game.started_by


def _turn(game: CoupleGame) -> UUID | None:
    return game.waiting_on_id if game.status == CoupleGameStatus.OPEN.value else None


# --- Who of us ---------------------------------------------------------------------


class WhoOfUsRemoteQuestion(ApiModel):
    question_id: str = Field(description="Client-localized question id.")
    my_answer: UUID | None = Field(description="The partner the reader chose, once answered.")
    partner_answered: bool
    partner_answer: UUID | None = Field(
        description="The partner the other partner chose; only once the reader answered too."
    )
    matches: bool | None = Field(description="Both chose the same partner; once both answered.")


class WhoOfUsRemoteGame(ApiModel):
    id: UUID
    status: CoupleGameStatus
    started_by: UUID
    ended_by: UUID | None
    turn_account_id: UUID | None = Field(
        description="While open: the partner still answering after the other one finished."
    )
    questions: list[WhoOfUsRemoteQuestion]
    my_answered_count: int
    partner_answered_count: int
    revealed_count: int
    agreement_count: int = Field(description="Revealed questions where both chose alike.")
    updated_at: datetime


class WhoOfUsRemoteState(ApiModel):
    game: WhoOfUsRemoteGame | None = None


class WhoOfUsAnswerInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    game_id: UUID
    question_id: str = Field(min_length=1, max_length=40)
    partner_id: UUID = Field(description="The partner the question applies to.")


def _who_of_us_view(
    session: DbSession, context: AuthorizationContext, game: CoupleGame | None
) -> WhoOfUsRemoteState:
    if game is None or game.payload.who_of_us is None:
        return WhoOfUsRemoteState()
    data = game.payload.who_of_us
    partner = _other_partner(session, context, game)
    mine = data.answers.get(context.account_id, {})
    theirs = data.answers.get(partner, {})
    questions: list[WhoOfUsRemoteQuestion] = []
    for question_id in data.question_ids:
        own = mine.get(question_id)
        other = theirs.get(question_id)
        revealed = own is not None and other is not None
        questions.append(
            WhoOfUsRemoteQuestion(
                question_id=question_id,
                my_answer=own,
                partner_answered=other is not None,
                partner_answer=other if revealed else None,
                matches=(own == other) if revealed else None,
            )
        )
    shown = [question for question in questions if question.matches is not None]
    return WhoOfUsRemoteState(
        game=WhoOfUsRemoteGame(
            id=game.id,
            status=CoupleGameStatus(game.status),
            started_by=game.started_by,
            ended_by=game.ended_by,
            turn_account_id=_turn(game),
            questions=questions,
            my_answered_count=len(mine),
            partner_answered_count=len(theirs),
            revealed_count=len(shown),
            agreement_count=sum(1 for question in shown if question.matches),
            updated_at=game.updated_at,
        )
    )


@router.get(
    _WHO_OF_US,
    response_model=WhoOfUsRemoteState,
    operation_id="getWhoOfUsRemoteGame",
    responses=problem_responses(401, 403, 404),
)
def get_who_of_us_remote_game(
    authorization: Authorization, session: DbSession, response: Response
) -> WhoOfUsRemoteState:
    """The current or last remote Who of us game, as the reader may see it."""
    _ensure_games(session, authorization, write=False)
    _no_store(response)
    game = service.get_game(session, authorization, CoupleGameKind.WHO_OF_US)
    return _who_of_us_view(session, authorization, game)


@router.post(
    _WHO_OF_US,
    response_model=WhoOfUsRemoteState,
    operation_id="startWhoOfUsRemoteGame",
    responses=problem_responses(401, 403, 404, 409),
)
def start_who_of_us_remote_game(
    authorization: Authorization, session: DbSession, response: Response
) -> WhoOfUsRemoteState:
    """Open a remote game; it replaces a finished or ended one."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.start_who_of_us(session, authorization)
    return _who_of_us_view(session, authorization, game)


@router.post(
    f"{_WHO_OF_US}/answers",
    response_model=WhoOfUsRemoteState,
    operation_id="answerWhoOfUsRemoteQuestion",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def answer_who_of_us_remote_question(
    body: WhoOfUsAnswerInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WhoOfUsRemoteState:
    """Answer one question; an answer cannot be changed afterwards."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.answer_who_of_us(
        session,
        authorization,
        game_id=body.game_id,
        question_id=body.question_id,
        partner_id=body.partner_id,
    )
    return _who_of_us_view(session, authorization, game)


@router.post(
    f"{_WHO_OF_US}/end",
    response_model=WhoOfUsRemoteState,
    operation_id="endWhoOfUsRemoteGame",
    responses=problem_responses(401, 403, 404, 409),
)
def end_who_of_us_remote_game(
    body: CoupleGameEndInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WhoOfUsRemoteState:
    """Either partner may end the open game; the revealed answers stay readable."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.end_game(session, authorization, CoupleGameKind.WHO_OF_US, game_id=body.game_id)
    return _who_of_us_view(session, authorization, game)


# --- Wish detective --------------------------------------------------------------


class WishDetectiveWishView(ApiModel):
    wish_id: UUID
    title: str


class WishDetectiveCurrentRound(ApiModel):
    round: int = Field(description="Zero-based round index.")
    giver_id: UUID
    guesser_id: UUID
    phase: WishDetectivePhase
    wish: WishDetectiveWishView | None = Field(
        description=(
            "Only for the giver; absent for the guesser and when the wish is no longer "
            "available (the giver then draws another one for free)."
        )
    )
    skips_left: int = Field(description="Skips the giver has left in this round.")
    clues: list[str] = Field(description="The three clues once given; empty before.")


class WishDetectiveRevealedRound(ApiModel):
    round: int
    giver_id: UUID
    guesser_id: UUID
    clues: list[str]
    guess: str | None = Field(description="Absent when the guesser passed.")
    result: WishDetectiveResult
    wish: WishDetectiveWishView | None = Field(
        description="Absent when the wish is no longer available."
    )


class WishDetectiveScore(ApiModel):
    account_id: UUID
    correct_guesses: int


class WishDetectiveRemoteGame(ApiModel):
    id: UUID
    status: CoupleGameStatus
    started_by: UUID
    ended_by: UUID | None
    rounds_total: int
    rounds_played: int
    turn_account_id: UUID | None = Field(description="Whose move it is while the game is open.")
    current: WishDetectiveCurrentRound | None = Field(description="Absent once the game is over.")
    revealed: list[WishDetectiveRevealedRound]
    scores: list[WishDetectiveScore]
    updated_at: datetime


class WishDetectiveReadiness(ApiModel):
    """Whether each partner has a wish to play; deliberately never a count."""

    own_wishes_available: bool
    partner_wishes_available: bool


class WishDetectiveRemoteState(ApiModel):
    game: WishDetectiveRemoteGame | None = None
    readiness: WishDetectiveReadiness


class WishDetectiveSkipInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    game_id: UUID
    round: int = Field(ge=0, le=_MAX_ROUND_INDEX)


class WishDetectiveCluesInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    game_id: UUID
    round: int = Field(ge=0, le=_MAX_ROUND_INDEX)
    clues: list[Annotated[str, Field(max_length=WISH_DETECTIVE_MAX_CLUE_INPUT)]] = Field(
        min_length=WISH_DETECTIVE_CLUE_COUNT,
        max_length=WISH_DETECTIVE_CLUE_COUNT,
        description="Three single words, none of them part of the wish title.",
    )


class WishDetectiveGuessInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    game_id: UUID
    round: int = Field(ge=0, le=_MAX_ROUND_INDEX)
    guess: str | None = Field(
        default=None,
        max_length=WISH_DETECTIVE_MAX_GUESS_LENGTH,
        description="The guessed wish; absent or `null` passes the round.",
    )


def _wish_detective_view(
    session: DbSession, context: AuthorizationContext, game: CoupleGame | None
) -> WishDetectiveRemoteState:
    ready = service.readiness(session, context)
    readiness = WishDetectiveReadiness(
        own_wishes_available=ready.own_wishes_available,
        partner_wishes_available=ready.partner_wishes_available,
    )
    if game is None or game.payload.wish_detective is None:
        return WishDetectiveRemoteState(readiness=readiness)
    data = game.payload.wish_detective
    partner = _other_partner(session, context, game)

    def guesser_of(giver: UUID) -> UUID:
        return partner if giver == context.account_id else context.account_id

    open_round = (
        data.rounds[-1]
        if game.status == CoupleGameStatus.OPEN.value
        and data.rounds
        and data.rounds[-1].result is None
        else None
    )
    revealed_rounds = [round_ for round_ in data.rounds if round_.result is not None]
    visible = {round_.wish_id for round_ in revealed_rounds}
    if open_round is not None and open_round.giver_id == context.account_id:
        visible.add(open_round.wish_id)
    titles = service.wish_titles(session, context, visible)

    def wish(wish_id: UUID) -> WishDetectiveWishView | None:
        title = titles.get(wish_id)
        return WishDetectiveWishView(wish_id=wish_id, title=title) if title else None

    current = None
    if open_round is not None:
        giving = open_round.giver_id == context.account_id
        phase = service.phase_of(open_round) or WishDetectivePhase.CLUE
        current = WishDetectiveCurrentRound(
            round=len(data.rounds) - 1,
            giver_id=open_round.giver_id,
            guesser_id=guesser_of(open_round.giver_id),
            phase=phase,
            wish=wish(open_round.wish_id) if giving else None,
            skips_left=max(0, WISH_DETECTIVE_SKIPS_PER_ROUND - open_round.skips) if giving else 0,
            clues=list(open_round.clues),
        )
    revealed = [
        WishDetectiveRevealedRound(
            round=index,
            giver_id=round_.giver_id,
            guesser_id=guesser_of(round_.giver_id),
            clues=list(round_.clues),
            guess=round_.guess,
            result=round_.result,
            wish=wish(round_.wish_id),
        )
        for index, round_ in enumerate(data.rounds)
        if round_.result is not None
    ]
    players = [
        game.started_by,
        partner if game.started_by == context.account_id else context.account_id,
    ]
    scores = [
        WishDetectiveScore(
            account_id=player,
            correct_guesses=sum(
                1
                for round_ in revealed
                if round_.guesser_id == player and round_.result is WishDetectiveResult.CORRECT
            ),
        )
        for player in players
    ]
    return WishDetectiveRemoteState(
        game=WishDetectiveRemoteGame(
            id=game.id,
            status=CoupleGameStatus(game.status),
            started_by=game.started_by,
            ended_by=game.ended_by,
            rounds_total=data.rounds_total,
            rounds_played=len(revealed),
            turn_account_id=_turn(game),
            current=current,
            revealed=revealed,
            scores=scores,
            updated_at=game.updated_at,
        ),
        readiness=readiness,
    )


@router.get(
    _WISH_DETECTIVE,
    response_model=WishDetectiveRemoteState,
    operation_id="getWishDetectiveRemoteGame",
    responses=problem_responses(401, 403, 404),
)
def get_wish_detective_remote_game(
    authorization: Authorization, session: DbSession, response: Response
) -> WishDetectiveRemoteState:
    """The current or last remote Wish detective game, as the reader may see it."""
    _ensure_games(session, authorization, write=False)
    _no_store(response)
    game = service.get_game(session, authorization, CoupleGameKind.WISH_DETECTIVE)
    return _wish_detective_view(session, authorization, game)


@router.post(
    _WISH_DETECTIVE,
    response_model=WishDetectiveRemoteState,
    operation_id="startWishDetectiveRemoteGame",
    responses=problem_responses(401, 403, 404, 409),
)
def start_wish_detective_remote_game(
    authorization: Authorization, session: DbSession, response: Response
) -> WishDetectiveRemoteState:
    """Open a remote game; the opener gives the first clues.

    Each partner needs at least one OPEN wish. Otherwise the
    problem code says who is missing one: `WISH_DETECTIVE_OWN_WISH_MISSING`,
    `WISH_DETECTIVE_PARTNER_WISH_MISSING` or `WISH_DETECTIVE_WISHES_MISSING`.
    """
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.start_wish_detective(session, authorization)
    return _wish_detective_view(session, authorization, game)


@router.post(
    f"{_WISH_DETECTIVE}/skip",
    response_model=WishDetectiveRemoteState,
    operation_id="skipWishDetectiveRemoteWish",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def skip_wish_detective_remote_wish(
    body: WishDetectiveSkipInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WishDetectiveRemoteState:
    """The giver draws another own wish (three times per round)."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.skip_wish(session, authorization, game_id=body.game_id, round_index=body.round)
    return _wish_detective_view(session, authorization, game)


@router.post(
    f"{_WISH_DETECTIVE}/clues",
    response_model=WishDetectiveRemoteState,
    operation_id="submitWishDetectiveRemoteClues",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def submit_wish_detective_remote_clues(
    body: WishDetectiveCluesInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WishDetectiveRemoteState:
    """The giver hands three clues to the guesser."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.submit_clues(
        session,
        authorization,
        game_id=body.game_id,
        round_index=body.round,
        clues=list(body.clues),
    )
    return _wish_detective_view(session, authorization, game)


@router.post(
    f"{_WISH_DETECTIVE}/guesses",
    response_model=WishDetectiveRemoteState,
    operation_id="guessWishDetectiveRemoteWish",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def guess_wish_detective_remote_wish(
    body: WishDetectiveGuessInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WishDetectiveRemoteState:
    """The guesser guesses (or passes); the round is revealed to both."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.guess_wish(
        session,
        authorization,
        game_id=body.game_id,
        round_index=body.round,
        guess=body.guess,
    )
    return _wish_detective_view(session, authorization, game)


@router.post(
    f"{_WISH_DETECTIVE}/end",
    response_model=WishDetectiveRemoteState,
    operation_id="endWishDetectiveRemoteGame",
    responses=problem_responses(401, 403, 404, 409),
)
def end_wish_detective_remote_game(
    body: CoupleGameEndInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WishDetectiveRemoteState:
    """Either partner may end the open game; revealed rounds stay readable."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.end_game(
        session, authorization, CoupleGameKind.WISH_DETECTIVE, game_id=body.game_id
    )
    return _wish_detective_view(session, authorization, game)


# --- Our moments -----------------------------------------------------------------


class OurMomentsFace(StrEnum):
    PHOTO = "PHOTO"
    CONTEXT = "CONTEXT"


class OurMomentsCardState(StrEnum):
    HIDDEN = "HIDDEN"
    REVEALED = "REVEALED"
    MATCHED = "MATCHED"


class OurMomentsMomentView(ApiModel):
    """The flipped card's Memory; the image loads through the attachment path."""

    memory_id: UUID
    image_attachment_id: UUID
    title: str | None = Field(description="Absent when the Memory is no longer readable.")
    effective_date: date | None


class OurMomentsCardView(ApiModel):
    position: int
    face: OurMomentsFace
    state: OurMomentsCardState
    moment: OurMomentsMomentView | None = Field(
        description="Only for a revealed or matched card; never for a hidden one."
    )


class OurMomentsLastTurnView(ApiModel):
    """The two cards of the latest completed turn, so the partner can see it."""

    player_id: UUID
    matched: bool
    cards: list[OurMomentsCardView]


class OurMomentsScore(ApiModel):
    account_id: UUID
    pairs: int


class OurMomentsRemoteGame(ApiModel):
    id: UUID
    status: CoupleGameStatus
    started_by: UUID
    ended_by: UUID | None
    turn_account_id: UUID | None = Field(description="Who flips next while the game is open.")
    flips_done: int = Field(description="Send back with the next flip; a mismatch is a conflict.")
    total_pairs: int
    matched_pairs: int
    cards: list[OurMomentsCardView]
    last_turn: OurMomentsLastTurnView | None
    scores: list[OurMomentsScore]
    updated_at: datetime


class OurMomentsRemoteState(ApiModel):
    game: OurMomentsRemoteGame | None = None


class OurMomentsFlipInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    game_id: UUID
    flips_done: int = Field(ge=0, le=10_000)
    position: int = Field(ge=0, lt=2 * OUR_MOMENTS_MAX_PAIRS)


def _our_moments_view(
    session: DbSession, context: AuthorizationContext, game: CoupleGame | None
) -> OurMomentsRemoteState:
    if game is None or game.payload.our_moments is None:
        return OurMomentsRemoteState()
    data = game.payload.our_moments
    partner = _other_partner(session, context, game)
    shown = set(data.matched) | set(data.flipped)
    if data.last_turn is not None:
        shown |= set(data.last_turn.positions)
    faces = service.moment_faces(
        session, context, {data.cards[position].memory_id for position in shown}
    )

    def moment_of(position: int) -> OurMomentsMomentView:
        entry = data.cards[position]
        face = faces.get(entry.memory_id)
        return OurMomentsMomentView(
            memory_id=entry.memory_id,
            image_attachment_id=entry.attachment_id,
            title=face.title if face else None,
            effective_date=face.effective_date if face else None,
        )

    def card(position: int, *, reveal: bool = False) -> OurMomentsCardView:
        state = (
            OurMomentsCardState.MATCHED
            if position in data.matched
            else OurMomentsCardState.REVEALED
            if position in data.flipped
            else OurMomentsCardState.HIDDEN
        )
        return OurMomentsCardView(
            position=position,
            face=OurMomentsFace(data.cards[position].face),
            state=state,
            moment=moment_of(position)
            if reveal or state is not OurMomentsCardState.HIDDEN
            else None,
        )

    players = [
        game.started_by,
        partner if game.started_by == context.account_id else context.account_id,
    ]
    return OurMomentsRemoteState(
        game=OurMomentsRemoteGame(
            id=game.id,
            status=CoupleGameStatus(game.status),
            started_by=game.started_by,
            ended_by=game.ended_by,
            turn_account_id=_turn(game),
            flips_done=data.flips_done,
            total_pairs=len(data.cards) // 2,
            matched_pairs=len(data.matched) // 2,
            cards=[card(position) for position in range(len(data.cards))],
            last_turn=OurMomentsLastTurnView(
                player_id=data.last_turn.player_id,
                matched=data.last_turn.matched,
                cards=[card(position, reveal=True) for position in data.last_turn.positions],
            )
            if data.last_turn
            else None,
            scores=[
                OurMomentsScore(account_id=player, pairs=data.scores.get(player, 0))
                for player in players
            ],
            updated_at=game.updated_at,
        )
    )


@router.get(
    _OUR_MOMENTS,
    response_model=OurMomentsRemoteState,
    operation_id="getOurMomentsRemoteGame",
    responses=problem_responses(401, 403, 404),
)
def get_our_moments_remote_game(
    authorization: Authorization, session: DbSession, response: Response
) -> OurMomentsRemoteState:
    """The current or last remote memory board, with only flipped cards revealed."""
    _ensure_games(session, authorization, write=False)
    _no_store(response)
    game = service.get_game(session, authorization, CoupleGameKind.OUR_MOMENTS)
    return _our_moments_view(session, authorization, game)


@router.post(
    _OUR_MOMENTS,
    response_model=OurMomentsRemoteState,
    operation_id="startOurMomentsRemoteGame",
    responses=problem_responses(401, 403, 404, 409),
)
def start_our_moments_remote_game(
    authorization: Authorization, session: DbSession, response: Response
) -> OurMomentsRemoteState:
    """Lay out a new board; the opener flips first.

    It needs at least three photo Memories both partners may read
    (`OUR_MOMENTS_MOMENTS_MISSING` otherwise).
    """
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.start_our_moments(session, authorization)
    return _our_moments_view(session, authorization, game)


@router.post(
    f"{_OUR_MOMENTS}/flips",
    response_model=OurMomentsRemoteState,
    operation_id="flipOurMomentsRemoteCard",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def flip_our_moments_remote_card(
    body: OurMomentsFlipInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> OurMomentsRemoteState:
    """Flip one card; the second card of a turn is judged at once."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.flip_card(
        session,
        authorization,
        game_id=body.game_id,
        flips_done=body.flips_done,
        position=body.position,
    )
    return _our_moments_view(session, authorization, game)


@router.post(
    f"{_OUR_MOMENTS}/end",
    response_model=OurMomentsRemoteState,
    operation_id="endOurMomentsRemoteGame",
    responses=problem_responses(401, 403, 404, 409),
)
def end_our_moments_remote_game(
    body: CoupleGameEndInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> OurMomentsRemoteState:
    """Either partner may end the open board; found pairs stay readable."""
    _ensure_games(session, authorization, write=True)
    _no_store(response)
    game = service.end_game(
        session, authorization, CoupleGameKind.OUR_MOMENTS, game_id=body.game_id
    )
    return _our_moments_view(session, authorization, game)
