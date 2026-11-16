"""Canonical shared notes linked to Plans through the typed relation lifecycle (#1969)."""

from typing import Annotated

from fastapi import APIRouter, Path, Response

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.v1.shared_notes import SharedNoteDetail, shared_note_details
from eimir.authorization import readable
from eimir.relations import service
from eimir.shared_notes.models import SharedNote

router = APIRouter(tags=["plans"])
_PATH = "/spaces/{spaceId}/plans/{planId}/notes"


@router.get(
    _PATH,
    response_model=list[SharedNoteDetail],
    operation_id="listPlanNotes",
    responses=problem_responses(401, 404),
)
def list_plan_notes(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
) -> list[SharedNoteDetail]:
    ids = service.list_targets(session, authorization, plan_id, service.PLAN_NOTES)
    notes = list(
        session.scalars(
            readable(SharedNote, authorization)
            .where(SharedNote.id.in_(ids))
            .order_by(SharedNote.edited_at.desc(), SharedNote.id.desc())
        )
    )
    return shared_note_details(session, notes)


@router.put(
    _PATH + "/{sharedNoteId}",
    status_code=204,
    response_class=Response,
    operation_id="linkPlanNote",
    responses=problem_responses(401, 404),
)
def link_plan_note(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
    note_id: Annotated[str, Path(alias="sharedNoteId")],
) -> Response:
    service.link(session, authorization, plan_id, note_id, service.PLAN_NOTES)
    return Response(status_code=204)


@router.delete(
    _PATH + "/{sharedNoteId}",
    status_code=204,
    response_class=Response,
    operation_id="unlinkPlanNote",
    responses=problem_responses(401, 404),
)
def unlink_plan_note(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
    note_id: Annotated[str, Path(alias="sharedNoteId")],
) -> Response:
    service.unlink(session, authorization, plan_id, note_id, service.PLAN_NOTES)
    return Response(status_code=204)
