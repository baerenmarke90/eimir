"""Date inspiration reads and the adoption of an idea as an ordinary Wish.

Every function here runs behind the Space capability
``planning.date_inspiration``; the router enforces it. Saved ideas become
regular shared Wishes through the canonical Wish service, so ordinary Wish
and Plan endpoints stay Free and unchanged, and a downgrade never touches them.

No caller-, partner- or click-derived signal is stored or evaluated: the only
Space state read here is which open Wishes already reference a catalog idea.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core.errors import NotFoundError
from eimir.date_ideas.catalog import (
    DateIdeaCatalog,
    IdeaFilter,
    ResolvedCategory,
    ResolvedIdea,
    get_catalog,
)
from eimir.wishes import service as wish_service
from eimir.wishes.models import Wish, WishStatus

DATE_IDEA_NOT_FOUND = "DATE_IDEA_NOT_FOUND"

# A Wish that is still open or already planned counts as "saved". A completed
# Wish does not block saving the same idea again for a new experience.
_ACTIVE_WISH_STATUSES = (WishStatus.OPEN.value, WishStatus.PLANNED.value)


@dataclass(frozen=True)
class DateIdeaListing:
    catalog: DateIdeaCatalog
    locale: str
    categories: list[ResolvedCategory]
    ideas: list[ResolvedIdea]
    saved_wish_ids: dict[str, UUID]
    total_active: int


def saved_wish_ids(session: Session, context: AuthorizationContext) -> dict[str, UUID]:
    """Map idea ID to the oldest open or planned Wish of this Space saved from it."""
    rows = session.execute(
        readable(Wish, context)
        .with_only_columns(Wish.date_idea_id, Wish.id)
        .where(
            Wish.date_idea_id.is_not(None),
            Wish.status.in_(_ACTIVE_WISH_STATUSES),
        )
        .order_by(Wish.created_at.desc(), Wish.id.desc())
    ).all()
    # Descending order lets the oldest Wish win when duplicates predate this
    # feature's lock (for example after a transfer import).
    return {idea_id: wish_id for idea_id, wish_id in rows}


def list_date_ideas(
    session: Session,
    context: AuthorizationContext,
    *,
    locale: str | None,
    idea_filter: IdeaFilter,
) -> DateIdeaListing:
    catalog = get_catalog()
    resolved_locale = catalog.resolve_locale(locale)
    return DateIdeaListing(
        catalog=catalog,
        locale=resolved_locale,
        categories=catalog.categories(resolved_locale),
        ideas=catalog.ideas(resolved_locale, idea_filter),
        saved_wish_ids=saved_wish_ids(session, context),
        total_active=len(catalog.ideas(resolved_locale)),
    )


def save_idea_as_wish(
    session: Session,
    context: AuthorizationContext,
    idea_id: str,
    *,
    locale: str | None,
    idempotency_key: UUID | None,
) -> wish_service.WishCreateResult:
    """Save a curated idea as a regular shared Wish, at most once while it is open.

    Both partners may save the same idea at the same moment; a transaction-level
    advisory lock per Space and idea serializes them, so the second request
    receives the first one's Wish instead of a duplicate. A retried request with
    the same ``Idempotency-Key`` replays through the canonical Wish receipt.
    """
    catalog = get_catalog()
    resolved_locale = catalog.resolve_locale(locale)
    idea = catalog.active_idea(idea_id, resolved_locale)
    if idea is None:
        raise NotFoundError("Date idea not found.", DATE_IDEA_NOT_FOUND)

    lock_key = f"date-idea-wish:{context.space_id}:{idea.id}"
    session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(lock_key, 0))))

    existing_id = (
        session.execute(
            readable(Wish, context)
            .with_only_columns(Wish.id)
            .where(Wish.date_idea_id == idea.id, Wish.status.in_(_ACTIVE_WISH_STATUSES))
            .order_by(Wish.created_at, Wish.id)
            .limit(1)
        )
        .scalars()
        .first()
    )
    if existing_id is not None:
        return wish_service.WishCreateResult(
            wish_service.get_wish(session, context, existing_id), created=False
        )

    return wish_service.create_wish_once(
        session,
        context,
        idempotency_key=idempotency_key,
        title=idea.title,
        description=idea.description,
        date_idea_id=idea.id,
    )
