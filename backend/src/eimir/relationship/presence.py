"""Server-authoritative, privacy-bounded partner presence."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.relationship.models import Membership, MembershipStatus, SpacePresence

ACTIVE_WINDOW = timedelta(minutes=2)
RECENT_WINDOW = timedelta(minutes=10)
PartnerPresenceState = Literal["ACTIVE", "RECENT"]


def touch(
    session: Session,
    *,
    space_id: UUID,
    account_id: UUID,
    observed_at: datetime | None = None,
) -> None:
    """Renew the caller's one current presence row with a server instant."""
    instant = clock.ensure_utc(observed_at if observed_at is not None else clock.now())
    statement = (
        insert(SpacePresence)
        .values(space_id=space_id, account_id=account_id, last_active_at=instant)
        .on_conflict_do_update(
            index_elements=[SpacePresence.space_id, SpacePresence.account_id],
            set_={"last_active_at": instant},
        )
    )
    session.execute(statement)
    session.flush()


def partner_state(
    session: Session,
    *,
    space_id: UUID,
    viewer_account_id: UUID,
    observed_at: datetime | None = None,
) -> PartnerPresenceState | None:
    """Return the other active partner's bounded state, never a timestamp."""
    instant = clock.ensure_utc(observed_at if observed_at is not None else clock.now())
    last_active_at = session.execute(
        select(SpacePresence.last_active_at)
        .join(
            Membership,
            and_(
                Membership.space_id == SpacePresence.space_id,
                Membership.account_id == SpacePresence.account_id,
            ),
        )
        .where(
            SpacePresence.space_id == space_id,
            SpacePresence.account_id != viewer_account_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one_or_none()
    if last_active_at is None:
        return None

    elapsed = instant - clock.ensure_utc(last_active_at)
    if elapsed < timedelta(0):
        elapsed = timedelta(0)
    if elapsed < ACTIVE_WINDOW:
        return "ACTIVE"
    if elapsed <= RECENT_WINDOW:
        return "RECENT"
    return None
