"""Canonical shared Wish examples required by Wunschdetektiv demo QA."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.wishes import service as wish_service
from eimir.wishes.models import Wish, WishStatus

MIN_OPEN_WISHES_PER_PARTNER = 2

LEA_WISH_DETECTIVE_EXAMPLES = ("Sterne gucken im Garten",)
ALEX_WISH_DETECTIVE_EXAMPLES = ("Mit dem Nachtzug ans Meer", "Frühstück am See")


def _ensure_open_wishes(
    session: Session,
    *,
    space_id: UUID,
    account_id: UUID,
    example_titles: tuple[str, ...],
) -> None:
    existing = list(
        session.execute(
            select(Wish).where(
                Wish.space_id == space_id,
                Wish.owner_id == account_id,
                Wish.status == WishStatus.OPEN.value,
            )
        ).scalars()
    )
    missing = max(0, MIN_OPEN_WISHES_PER_PARTNER - len(existing))
    if missing == 0:
        return

    existing_titles = {wish.payload.title for wish in existing}
    context = AuthorizationContext(account_id=account_id, space_id=space_id)
    for title in example_titles:
        if missing == 0:
            break
        if title in existing_titles:
            continue
        wish_service.create_wish(session, context, title=title)
        existing_titles.add(title)
        missing -= 1

    if missing:
        raise RuntimeError(
            "Canonical demo does not define enough OPEN Wish examples for Wunschdetektiv."
        )


def ensure_wish_detective_examples(
    session: Session,
    *,
    space_id: UUID,
    lea_id: UUID,
    alex_id: UUID,
) -> None:
    """Ensure the canonical couple has a balanced, real Wish pool for #864.

    The examples are ordinary SPACE_SHARED Wishes created through the same
    domain service as product traffic. They are not a game-local fixture and
    therefore remain subject to normal Wish authorization and lifecycle rules.
    Re-running this after ``ensure`` is idempotent; a canonical reset recreates
    the examples in the new Space.
    """
    _ensure_open_wishes(
        session,
        space_id=space_id,
        account_id=lea_id,
        example_titles=LEA_WISH_DETECTIVE_EXAMPLES,
    )
    _ensure_open_wishes(
        session,
        space_id=space_id,
        account_id=alex_id,
        example_titles=ALEX_WISH_DETECTIVE_EXAMPLES,
    )
