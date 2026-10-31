"""Authorized HTTP contract for monthly/yearly recap editions and reflections."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import ConfigDict, Field
from sqlalchemy import select, true

from eimir.api.concurrency import IfMatchVersion
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core import clock
from eimir.recaps import invalidation as _invalidation  # noqa: F401
from eimir.recaps import service
from eimir.recaps.models import RecapEdition, RecapKind, RecapSourceKind


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(tags=["recaps"], dependencies=[Depends(no_store)])


class RecapPeriod(ApiModel):
    kind: RecapKind
    year: int = Field(ge=1900, le=2100)
    month: int = Field(default=0, ge=0, le=12)


class RecapRequest(RecapPeriod):
    model_config = ConfigDict(extra="forbid")
    variant: int = Field(default=0, ge=0, le=3)
    refresh: bool = False


class RecapSourceView(ApiModel):
    key: str
    kind: RecapSourceKind
    id: UUID
    occurred_on: date | None
    version: int | None
    title: str | None
    excerpt: str | None
    preview_attachment_id: UUID | None
    preview_is_sensitive: bool
    available: bool


class RecapReflectionView(ApiModel):
    id: UUID
    owner_id: UUID
    display_name: str
    text: str
    version: int


class RecapDraftView(ApiModel):
    text: str
    version: int


class RecapView(RecapPeriod):
    id: UUID
    variant: int
    version: int
    starts_on: date
    through_on: date
    is_partial: bool
    status: str
    theme: str
    generated_at: datetime | None
    saved_at: datetime | None
    locale: str
    headline: str | None
    introduction: str | None
    sources: list[RecapSourceView]
    reflections: list[RecapReflectionView]
    own_draft: RecapDraftView | None


class RecapOverview(ApiModel):
    can_compose: bool
    editions: list[RecapView]
    periods: list[RecapPeriod]
    has_more: bool


class RecapSelectionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    source_keys: list[str] = Field(max_length=12)


class RecapSelectionView(ApiModel):
    items: list[RecapSourceView]
    selected_keys: list[str]


class RecapReflectionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=2000)
    shared: bool
    version: int = Field(ge=0)


def project(session: DbSession, context: Authorization, value: RecapEdition) -> RecapView:
    return RecapView.model_validate(service.project(session, context, value))


@router.get(
    "/spaces/{spaceId}/recaps",
    response_model=RecapOverview,
    operation_id="getRecapOverview",
    responses=problem_responses(401, 404),
)
def overview(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
    kind: RecapKind | None = None,
) -> RecapOverview:
    response.headers["Cache-Control"] = "private, no-store"
    allowed = service.can_compose(session, authorization)
    values = list(
        session.scalars(
            select(RecapEdition)
            .where(
                RecapEdition.space_id == authorization.space_id,
                true() if kind is None else RecapEdition.kind == kind.value,
            )
            .order_by(
                RecapEdition.year.desc(), RecapEdition.month.desc(), RecapEdition.created_at.desc()
            )
            .offset(offset)
            .limit(25)
        )
    )
    zone, _ = service.calendar_context(session, authorization)
    return RecapOverview(
        can_compose=allowed,
        editions=[
            RecapView.model_validate(item)
            for item in service.summaries(session, authorization, values[:24])
        ],
        periods=[
            RecapPeriod.model_validate(item)
            for item in service.periods(session, authorization, clock.today_in(zone))
        ]
        if allowed
        else [],
        has_more=len(values) > 24,
    )


@router.post(
    "/spaces/{spaceId}/recaps/prepare",
    status_code=202,
    operation_id="prepareRelationshipRecaps",
    responses=problem_responses(401, 403, 404),
)
def prepare(authorization: Authorization, session: DbSession) -> None:
    ensure_capability(session, authorization.space_id, service.CAPABILITY)
    service.prepare_current(session, authorization)


@router.post(
    "/spaces/{spaceId}/recaps",
    response_model=RecapView,
    operation_id="requestRelationshipRecap",
    responses=problem_responses(401, 403, 404, 422),
)
def request_recap(
    payload: RecapRequest, authorization: Authorization, session: DbSession
) -> RecapView:
    value = service.request_period(
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
    "/spaces/{spaceId}/recaps/{recapId}",
    response_model=RecapView,
    operation_id="getRelationshipRecap",
    responses=problem_responses(401, 404),
)
def get_recap(
    recap_id: Annotated[str, Path(alias="recapId")],
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> RecapView:
    response.headers["Cache-Control"] = "private, no-store"
    return project(session, authorization, service.edition(session, authorization, recap_id))


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
    value = service.edition(session, authorization, recap_id)
    ensure_capability(session, authorization.space_id, service.CAPABILITY, lock_grants=False)
    current, _ = service.materials(session, authorization, value)
    pool = service.candidates(
        session, authorization, value.starts_on, value.through_on, value.variant
    )
    eligible = [
        item
        for source in pool
        if (item := service.source_material(session, authorization, source)) is not None
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
    service.replace_sources(session, authorization, value, payload.source_keys)
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
        from eimir.core.errors import ConflictError, ErrorCode

        raise ConflictError("The recap is not ready.", ErrorCode.VERSION_CONFLICT)
    if not value.saved_at:
        value.saved_at = clock.now()
    session.flush()
    return project(session, authorization, value)


@router.put(
    "/spaces/{spaceId}/recaps/{recapId}/reflection",
    response_model=RecapView,
    operation_id="updateRecapReflection",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def reflect(
    recap_id: Annotated[str, Path(alias="recapId")],
    payload: RecapReflectionUpdate,
    authorization: Authorization,
    session: DbSession,
) -> RecapView:
    value = service.edition(session, authorization, recap_id, write=True)
    service.write_reflection(
        session, authorization, value, payload.text, payload.shared, payload.version
    )
    return project(session, authorization, value)


@router.delete(
    "/spaces/{spaceId}/recaps/{recapId}/reflection",
    status_code=204,
    operation_id="withdrawRecapReflection",
    responses=problem_responses(401, 404, 409),
)
def withdraw(
    recap_id: Annotated[str, Path(alias="recapId")],
    expected_version: IfMatchVersion,
    authorization: Authorization,
    session: DbSession,
) -> None:
    value = service.edition(session, authorization, recap_id)
    service.withdraw_reflection(session, authorization, value, expected_version)
