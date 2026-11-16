"""Presentation rules for discreet Plans (#1790 F3).

Discreet is a visual shield against onlookers, not a permission. Authorization
is unchanged and both partners keep full access to the detail. Every surface
outside the Plan detail (overviews, Search, activity, Wir, recaps, push) shows
only the list title and conceals description, place, comments and photos.
"""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.plans.models import DiscreetTitleMode, Plan


def list_title(plan: Plan) -> str | None:
    """Return the title overviews may show.

    ``None`` asks the client for its neutral localized fallback. It is only
    returned for a discreet Plan in preview mode without a preview title.
    """
    if not plan.discreet or plan.discreet_title_mode == DiscreetTitleMode.ORIGINAL.value:
        return plan.payload.title
    preview = (plan.payload.preview_title or "").strip()
    return preview or None


def discreet_plan_ids(session: Session, plan_ids: Iterable[UUID]) -> set[UUID]:
    """Return which of the already-authorized Plan ids are discreet."""
    ids = set(plan_ids)
    if not ids:
        return set()
    return set(session.scalars(select(Plan.id).where(Plan.id.in_(ids), Plan.discreet.is_(True))))
