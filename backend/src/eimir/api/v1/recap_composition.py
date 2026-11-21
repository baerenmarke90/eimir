"""HTTP contract of the Pro recap composition (Decision 0017, #2085).

Mounted by the Pro plugin through ``routers()``; a Core-only server has no such
routes. Preparing, requesting, curating and keeping an edition compose something
new, which is Premium. Reading stored editions and the couple's own reflections
stay Core routes in ``eimir.api.v1.recaps``. Tag, paths, ``operation_id``s and
schema names are those of the former Core routes, so the full OpenAPI contract
and the generated clients are unchanged.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from pydantic import ConfigDict, Field

from eimir.api.concurrency import IfMatchVersion
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.recaps import RecapPeriod, RecapSourceView, RecapView, no_store, project
from eimir.core import clock
from eimir.core.errors import ConflictError, ErrorCode
from eimir.recap_composition import composer
from eimir.recap_composition.selection import replace_sources
from eimir.recaps import presentation, service
from eimir.recaps.composition import MANUAL_SELECTION_LIMIT

router = APIRouter(tags=["recaps"], dependencies=[Depends(no_store)])


class RecapRequest(RecapPeriod):
    model_config = ConfigDict(extra="forbid")
    variant: int = Field(default=0, ge=0, le=3)
    refresh: bool = False


class RecapSelectionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    source_keys: list[str] = Field(max_length=MANUAL_SELECTION_LIMIT)


class RecapSelectionView(ApiModel):
    items: list[RecapSourceView]
    selected_keys: list[str]


@router.post(
    "/spaces/{spaceId}/recaps/prepare",
    status_code=202,
    operation_id="prepareRelationshipRecaps",
    responses=problem_responses(401, 403, 404),
)
def prepare(authorization: Authorization, session: DbSession) -> None:
    ensure_capability(session, authorization.space_id, service.CAPABILITY)
    composer.prepare_current(session, authorization)


@router.post(
    "/spaces/{spaceId}/recaps",
    response_model=RecapView,
    operation_id="requestRelationshipRecap",
    responses=problem_responses(401, 403, 404, 422),
)
def request_recap(
    payload: RecapRequest, authorization: Authorization, session: DbSession
) -> RecapView:
    value = composer.request_period(
        session,
        authorization,
        payload.kind,
        payload.year,
        payload.month,
        variant=payload.variant,
        refresh=payload.refresh,
    )
    return project(session, authorization, value)


@router.get(
    "/spaces/{spaceId}/recaps/{recapId}/selection",
    response_model=RecapSelectionView,
    operation_id="getRecapSelection",
    responses=problem_responses(401, 403, 404),
)
def get_selection(
    recap_id: Annotated[str, Path(alias="recapId")],
    authorization: Authorization,
    session: DbSession,
) -> RecapSelectionView:
    # The capability comes first, as for the other composing routes: without
    # it an unknown and an existing edition are indistinguishable.
    ensure_capability(session, authorization.space_id, service.CAPABILITY, lock_grants=False)
    value = service.edition(session, authorization, recap_id)
    current, _ = presentation.materials(session, authorization, value)
    pool = composer.candidates(
        session, authorization, value.starts_on, value.through_on, value.variant
    )
    eligible = [
        item
        for source in pool
        if (item := presentation.source_material(session, authorization, source)) is not None
    ]
    merged = {item["key"]: item for item in [*eligible, *current] if item["available"]}
    return RecapSelectionView(
        items=[RecapSourceView.model_validate(item) for item in merged.values()],
        selected_keys=[item["key"] for item in current if item["available"]],
    )


@router.put(
    "/spaces/{spaceId}/recaps/{recapId}/selection",
    response_model=RecapView,
    operation_id="updateRecapSelection",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def update_selection(
    recap_id: Annotated[str, Path(alias="recapId")],
    payload: RecapSelectionUpdate,
    expected_version: IfMatchVersion,
    authorization: Authorization,
    session: DbSession,
) -> RecapView:
    ensure_capability(session, authorization.space_id, service.CAPABILITY)
    value = service.edition(session, authorization, recap_id, write=True, version=expected_version)
    replace_sources(session, authorization, value, payload.source_keys)
    session.flush()
    return project(session, authorization, value)


@router.post(
    "/spaces/{spaceId}/recaps/{recapId}/save",
    response_model=RecapView,
    operation_id="saveRecapEdition",
    responses=problem_responses(401, 403, 404, 409),
)
def save(
    recap_id: Annotated[str, Path(alias="recapId")],
    expected_version: IfMatchVersion,
    authorization: Authorization,
    session: DbSession,
) -> RecapView:
    ensure_capability(session, authorization.space_id, service.CAPABILITY)
    value = service.edition(session, authorization, recap_id, write=True, version=expected_version)
    if value.status not in {"READY", "EMPTY"}:
        raise ConflictError("The recap is not ready.", ErrorCode.VERSION_CONFLICT)
    if not value.saved_at:
        value.saved_at = clock.now()
    session.flush()
    return project(session, authorization, value)
