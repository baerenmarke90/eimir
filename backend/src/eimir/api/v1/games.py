"""Premium-protected read seams for relationship-native games."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.entitlements.models import Capability
from eimir.games import service

router = APIRouter(tags=["games"])


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
