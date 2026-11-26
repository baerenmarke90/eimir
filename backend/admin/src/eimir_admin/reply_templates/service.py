"""The operator's reply templates (#2327, design section 5.2).

Shared by all ServerAdmins. Names are unique regardless of case; at most
``TEMPLATE_LIMIT`` templates exist. Template text never enters logs or the
privileged audit: it is operator text, not an action on a person.
"""

from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.core.errors import ConflictError, NotFoundError
from eimir_admin.reply_templates.models import TEMPLATE_LIMIT, SupportReplyTemplate

TEMPLATE_NOT_FOUND = "SUPPORT_TEMPLATE_NOT_FOUND"
TEMPLATE_LIMIT_REACHED = "SUPPORT_TEMPLATE_LIMIT"
TEMPLATE_NAME_TAKEN = "SUPPORT_TEMPLATE_NAME_TAKEN"


def list_templates(session: Session) -> list[SupportReplyTemplate]:
    """Every template, sorted by name regardless of case."""
    return list(
        session.execute(
            select(SupportReplyTemplate).order_by(
                func.lower(SupportReplyTemplate.name), SupportReplyTemplate.id
            )
        ).scalars()
    )


def _get(session: Session, template_id: UUID) -> SupportReplyTemplate:
    template = session.get(SupportReplyTemplate, template_id)
    if template is None:
        raise NotFoundError("Reply template not found.", TEMPLATE_NOT_FOUND)
    return template


def _name_taken() -> ConflictError:
    return ConflictError("A reply template with this name exists.", TEMPLATE_NAME_TAKEN)


def _ensure_name_free(session: Session, name: str, *, exclude: UUID | None = None) -> None:
    statement = select(SupportReplyTemplate.id).where(
        func.lower(SupportReplyTemplate.name) == name.lower()
    )
    if exclude is not None:
        statement = statement.where(SupportReplyTemplate.id != exclude)
    if session.execute(statement.limit(1)).first() is not None:
        raise _name_taken()


def _write(session: Session, change: Callable[[], None]) -> None:
    """Apply and flush a change in a savepoint.

    A concurrent writer that took the name after the pre-check loses on the
    unique index; only the savepoint rolls back, so the conflict is a 409 and
    the request's transaction stays usable. The change must happen inside the
    savepoint: opening it flushes pending state first.
    """
    try:
        with session.begin_nested():
            change()
            session.flush()
    except IntegrityError as error:
        raise _name_taken() from error


def create_template(session: Session, *, name: str, text: str) -> SupportReplyTemplate:
    count = session.execute(select(func.count()).select_from(SupportReplyTemplate)).scalar_one()
    if count >= TEMPLATE_LIMIT:
        raise ConflictError("The reply template limit is reached.", TEMPLATE_LIMIT_REACHED)
    _ensure_name_free(session, name)
    template = SupportReplyTemplate(name=name, text=text)
    _write(session, lambda: session.add(template))
    session.refresh(template)
    return template


def update_template(
    session: Session, template_id: UUID, *, name: str, text: str
) -> SupportReplyTemplate:
    template = _get(session, template_id)
    _ensure_name_free(session, name, exclude=template.id)

    def change() -> None:
        template.name = name
        template.text = text

    _write(session, change)
    session.refresh(template)
    return template


def delete_template(session: Session, template_id: UUID) -> None:
    session.delete(_get(session, template_id))
    session.flush()
