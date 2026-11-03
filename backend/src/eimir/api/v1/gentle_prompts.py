"""Authenticated personal activity and contextual invitation actions."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Response
from pydantic import ConfigDict

from eimir.api.deps import DbSession, RecipientEffectAuthorization
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import NotFoundError
from eimir.core.ids import parse_id
from eimir.engagement import gentle
from eimir.engagement.models import GentleOccasion
from eimir.memories.models import Memory

router = APIRouter(prefix="/spaces/{spaceId}/gentle-prompts", tags=["notifications"])


class GentleUseReceipt(ApiModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["FOREGROUND"]


class GentleSuggestion(ApiModel):
    id: UUID
    kind: Literal["WRITING", "MEMORY"]
    memory_id: UUID | None
    expires_at: datetime
    writing_variant: int


def _view(occasion: GentleOccasion) -> GentleSuggestion:
    return GentleSuggestion(
        id=occasion.id,
        kind="MEMORY" if occasion.memory_id else "WRITING",
        memory_id=occasion.memory_id,
        expires_at=occasion.expires_at,
        writing_variant=occasion.created_at.date().toordinal() % 3,
    )


@router.post(
    "/use",
    status_code=204,
    operation_id="recordGentleUse",
    responses=problem_responses(401, 404, 422),
)
def record_use(
    body: GentleUseReceipt, authorization: RecipientEffectAuthorization, session: DbSession
) -> Response:
    del body
    gentle.record_use(session, authorization)
    return Response(status_code=204, headers={"Cache-Control": "private, no-store"})


@router.get(
    "/suggestion",
    response_model=GentleSuggestion | None,
    operation_id="getGentleSuggestion",
    responses=problem_responses(401, 404),
)
def get_suggestion(
    authorization: RecipientEffectAuthorization, session: DbSession, response: Response
) -> GentleSuggestion | None:
    occasion = gentle.suggestion(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(occasion) if occasion is not None else None


def _occasion_id(raw: str) -> UUID:
    identifier = parse_id(raw)
    if identifier is None:
        raise NotFoundError("Suggestion not found.", "RESOURCE_NOT_FOUND")
    return identifier


@router.post(
    "/{occasionId}/dismiss",
    status_code=204,
    operation_id="dismissGentleSuggestion",
    responses=problem_responses(401, 404),
)
def dismiss_suggestion(
    authorization: RecipientEffectAuthorization,
    session: DbSession,
    occasion_id: Annotated[str, Path(alias="occasionId")],
) -> Response:
    if (
        gentle.change_occasion(session, authorization, _occasion_id(occasion_id), opened=False)
        is None
    ):
        raise NotFoundError("Suggestion not found.", "RESOURCE_NOT_FOUND")
    return Response(status_code=204, headers={"Cache-Control": "private, no-store"})


@router.post(
    "/{occasionId}/open",
    response_model=GentleSuggestion,
    operation_id="openGentleSuggestion",
    responses=problem_responses(401, 404),
)
def open_suggestion(
    authorization: RecipientEffectAuthorization,
    session: DbSession,
    response: Response,
    occasion_id: Annotated[str, Path(alias="occasionId")],
) -> GentleSuggestion:
    occasion = gentle.change_occasion(
        session, authorization, _occasion_id(occasion_id), opened=True
    )
    if occasion is None:
        raise NotFoundError("Suggestion not found.", "RESOURCE_NOT_FOUND")
    response.headers["Cache-Control"] = "private, no-store"
    return _view(occasion)


@router.put(
    "/memories/{memoryId}/exclusion",
    status_code=204,
    operation_id="excludeGentleMemory",
    responses=problem_responses(401, 404),
)
def exclude_memory(
    authorization: RecipientEffectAuthorization,
    session: DbSession,
    memory_id: Annotated[str, Path(alias="memoryId")],
) -> Response:
    identifier = parse_id(memory_id)
    if identifier is None:
        raise Memory.privacy_absence.error()
    gentle.exclude_memory(session, authorization, identifier)
    return Response(status_code=204, headers={"Cache-Control": "private, no-store"})
