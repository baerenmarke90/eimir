"""Premium-protected read seams for relationship-native games."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Response
from fastapi import status as http_status
from pydantic import Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core import clock
from eimir.domain.experiences import ExperienceKind
from eimir.entitlements.models import Capability
from eimir.games.questions import select_questions
from eimir.memories import experiences
from eimir.recaps.service import calendar_context
from eimir_pro.games import notices, service, waiting
from eimir_pro.games.notices import GameNoticeSurface
from eimir_pro.games.waiting import WaitingGameKind, WaitingGameReason

router = APIRouter(tags=["games"])


class CoupleExperienceQuestionState(ApiModel):
    """Answer state of one daily question for the reading partner."""

    question_id: str
    memory_id: UUID | None = Field(
        default=None,
        description=(
            "Shared experience to open or answer: the thread still waiting for the reader "
            "when the partner answered first, otherwise the latest thread for this question."
        ),
    )
    answered_by_me: bool
    answered_by_partner: bool


class CoupleExperienceQuestions(ApiModel):
    kind: ExperienceKind
    local_date: date
    question_ids: list[str]
    question_states: list[CoupleExperienceQuestionState] = Field(default_factory=list)
    refresh_after_seconds: int


@router.get(
    "/spaces/{spaceId}/experiences/{kind}/questions",
    response_model=CoupleExperienceQuestions,
    operation_id="getCoupleExperienceQuestions",
    responses=problem_responses(401, 403, 404),
)
def get_couple_experience_questions(
    kind: ExperienceKind, authorization: Authorization, session: DbSession, response: Response
) -> CoupleExperienceQuestions:
    """Three stable inspirations per shared calendar day, without an answer limit."""
    ensure_capability(
        session, authorization.space_id, Capability.GAMES_COUPLE.value, lock_grants=False
    )
    zone, _ = calendar_context(session, authorization)
    instant = clock.now()
    day = clock.today_in(zone, at=instant)
    boundary = clock.resolve_local(day + timedelta(days=1), time.min, clock.resolve_zone(zone))
    response.headers["Cache-Control"] = "private, no-store"
    question_ids = list(select_questions(authorization.space_id, kind, day))
    day_start = clock.resolve_local(day, time.min, clock.resolve_zone(zone))
    states = experiences.daily_question_states(
        session, authorization, kind, question_ids, day_start
    )
    return CoupleExperienceQuestions(
        kind=kind,
        local_date=day,
        question_ids=question_ids,
        question_states=[
            CoupleExperienceQuestionState(
                question_id=state.question_id,
                memory_id=state.memory_id,
                answered_by_me=state.answered_by_me,
                answered_by_partner=state.answered_by_partner,
            )
            for state in states
        ],
        refresh_after_seconds=max(1, int((boundary - instant).total_seconds())),
    )


class GameMemoryCandidate(ApiModel):
    """Minimal authorized Memory context required by `Unsere Momente`."""

    memory_id: UUID
    title: str
    effective_date: date
    image_attachment_id: UUID


class GameMemoryCandidateSet(ApiModel):
    """Bounded candidate pool without hidden/private-derived totals."""

    items: list[GameMemoryCandidate]


@router.get(
    "/spaces/{spaceId}/games/moments/candidates",
    response_model=GameMemoryCandidateSet,
    operation_id="getGameMomentCandidates",
    responses=problem_responses(401, 403, 404),
)
def get_game_moment_candidates(
    authorization: Authorization,
    session: DbSession,
) -> GameMemoryCandidateSet:
    """Return Premium-authorized shared photo Memories for the first #863 grammar.

    Normal authentication and Space membership are resolved before this route
    receives `authorization`. Commercial entitlement is then enforced on the
    server. The actual content query remains constrained by the existing
    `readable()` authorization predicate and existing attachment bindings.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.GAMES_COUPLE.value,
        lock_grants=False,
    )
    return GameMemoryCandidateSet(
        items=[
            GameMemoryCandidate(
                memory_id=candidate.memory_id,
                title=candidate.title,
                effective_date=candidate.effective_date,
                image_attachment_id=candidate.image_attachment_id,
            )
            for candidate in service.read_memory_candidates(session, authorization)
        ]
    )


class GameWishCandidate(ApiModel):
    """Minimal authorized OPEN Wish context required by Wunschdetektiv."""

    wish_id: UUID
    created_by: UUID
    title: str


class GameWishCandidateSet(ApiModel):
    """Bounded Wish pool without private-derived totals."""

    items: list[GameWishCandidate]


@router.get(
    "/spaces/{spaceId}/games/wishes/candidates",
    response_model=GameWishCandidateSet,
    operation_id="getGameWishCandidates",
    responses=problem_responses(401, 403, 404),
)
def get_game_wish_candidates(
    authorization: Authorization,
    session: DbSession,
) -> GameWishCandidateSet:
    """Return Premium-authorized OPEN shared Wishes for #864."""
    ensure_capability(
        session,
        authorization.space_id,
        Capability.GAMES_COUPLE.value,
        lock_grants=False,
    )
    return GameWishCandidateSet(
        items=[
            GameWishCandidate(
                wish_id=candidate.wish_id,
                created_by=candidate.created_by,
                title=candidate.title,
            )
            for candidate in service.read_wish_candidates(session, authorization)
        ]
    )


class WaitingGameView(ApiModel):
    """One game that waits on the reader; it names the game and the ask only."""

    game: WaitingGameKind = Field(description="The game; the client opens its own page.")
    reason: WaitingGameReason = Field(description="What the reader is asked to do.")
    since: datetime = Field(description="When the game started waiting on the reader.")


class WaitingGames(ApiModel):
    items: list[WaitingGameView] = Field(
        description="Every game that waits on the reader, newest first; empty when none."
    )


@router.get(
    "/spaces/{spaceId}/games/waiting",
    response_model=WaitingGames,
    operation_id="getWaitingGames",
    responses=problem_responses(401, 403, 404),
)
def get_waiting_games(
    authorization: Authorization, session: DbSession, response: Response
) -> WaitingGames:
    """Games that wait on the reader, for Wir (#2158 C); never their content."""
    ensure_capability(
        session, authorization.space_id, Capability.GAMES_COUPLE.value, lock_grants=False
    )
    response.headers["Cache-Control"] = "private, no-store"
    return WaitingGames(
        items=[
            WaitingGameView(game=item.kind, reason=item.reason, since=item.since)
            for item in waiting.waiting_games(session, authorization)
        ]
    )


@router.post(
    "/spaces/{spaceId}/games/{surface}/notices/read",
    status_code=http_status.HTTP_204_NO_CONTENT,
    operation_id="markGameNoticesRead",
    responses=problem_responses(401, 404, 422),
)
def mark_game_notices_read(
    surface: Annotated[GameNoticeSurface, Path()],
    authorization: Authorization,
    session: DbSession,
) -> Response:
    """The reader opened a game page; its notices are handled everywhere (#2345).

    Marks only the reader's own notices read. It reveals nothing and is not
    gameplay, so it needs no Premium capability: after a downgrade the reader can
    still clear what was announced before.
    """
    notices.mark_surface_notices_read(session, authorization, surface)
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)
