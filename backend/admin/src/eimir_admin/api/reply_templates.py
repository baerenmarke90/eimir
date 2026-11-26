"""Operator routes for reply templates (#2327, design section 5.2).

The same guard as the report routes: a ServerAdmin, the operator switch (404
while support reports are off), ``Cache-Control: private, no-store`` and no
step-up. Writes leave no privileged audit entry: templates are operator text
and touch no person. This router is mounted before the report router so that
``/templates`` is never read as a report id.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, status
from pydantic import StringConstraints

from eimir.api.deps import DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import NotFoundError
from eimir.core.ids import parse_id
from eimir_admin.api.support_reports import Operator, _no_store
from eimir_admin.reply_templates import service
from eimir_admin.reply_templates.models import (
    TEMPLATE_NAME_MAX,
    TEMPLATE_TEXT_MAX,
    SupportReplyTemplate,
)

router = APIRouter(
    prefix="/server-admin/support-reports/templates",
    tags=["server-admin-support-reports"],
    dependencies=[Depends(_no_store)],
)

TemplateIdPath = Annotated[str, Path(alias="templateId", max_length=64)]


class SupportReplyTemplateView(ApiModel):
    """One reply template: a short name for the chip and the text it inserts."""

    id: UUID
    name: str
    text: str
    created_at: datetime
    updated_at: datetime


class SupportReplyTemplateListView(ApiModel):
    # Sorted by name regardless of case.
    items: list[SupportReplyTemplateView]


class SupportReplyTemplateWrite(ApiModel):
    """Name and text, trimmed; at most 40 and 500 characters."""

    name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TEMPLATE_NAME_MAX)
    ]
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TEMPLATE_TEXT_MAX)
    ]


def _view(template: SupportReplyTemplate) -> SupportReplyTemplateView:
    return SupportReplyTemplateView(
        id=template.id,
        name=template.name,
        text=template.text,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _template_id(value: str) -> UUID:
    """Unknown and malformed ids are the same 404."""
    parsed = parse_id(value)
    if parsed is None:
        raise NotFoundError("Reply template not found.", service.TEMPLATE_NOT_FOUND)
    return parsed


@router.get(
    "",
    response_model=SupportReplyTemplateListView,
    operation_id="listSupportReplyTemplates",
    responses=problem_responses(401, 403, 404),
)
def list_support_reply_templates(_: Operator, session: DbSession) -> SupportReplyTemplateListView:
    """List the reply templates shared by all ServerAdmins."""
    return SupportReplyTemplateListView(
        items=[_view(template) for template in service.list_templates(session)]
    )


@router.post(
    "",
    response_model=SupportReplyTemplateView,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSupportReplyTemplate",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def create_support_reply_template(
    body: SupportReplyTemplateWrite, _: Operator, session: DbSession
) -> SupportReplyTemplateView:
    """Create a template; at most 30 exist and names are unique regardless of case."""
    return _view(service.create_template(session, name=body.name, text=body.text))


@router.put(
    "/{templateId}",
    response_model=SupportReplyTemplateView,
    operation_id="updateSupportReplyTemplate",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def update_support_reply_template(
    template_id_text: TemplateIdPath,
    body: SupportReplyTemplateWrite,
    _: Operator,
    session: DbSession,
) -> SupportReplyTemplateView:
    """Replace a template's name and text."""
    return _view(
        service.update_template(
            session, _template_id(template_id_text), name=body.name, text=body.text
        )
    )


@router.delete(
    "/{templateId}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteSupportReplyTemplate",
    responses=problem_responses(401, 403, 404),
)
def delete_support_reply_template(
    template_id_text: TemplateIdPath, _: Operator, session: DbSession
) -> None:
    """Delete a template for good."""
    service.delete_template(session, _template_id(template_id_text))
