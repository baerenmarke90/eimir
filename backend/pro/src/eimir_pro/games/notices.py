"""Opening a game page handles its notices (#2345).

A game page shows everything its notices announce (your turn, a hidden heart,
a seed, a finished picture), whichever way the reader arrived: the Wir row, the
Games tab or a push. Opening it therefore marks the reader's unread notices of
that game read, so the inbox, the badge and the device trays stop repeating it.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.engagement import service as engagement
from eimir.engagement.models import EngagementTarget, NotificationKind


class GameNoticeSurface(StrEnum):
    """A game page that presents its own notices."""

    WHO_OF_US = "WHO_OF_US"
    WISH_DETECTIVE = "WISH_DETECTIVE"
    OUR_MOMENTS = "OUR_MOMENTS"
    PICTURE_PING_PONG = "PICTURE_PING_PONG"
    HEART_HUNT = "HEART_HUNT"
    GARDEN = "GARDEN"


@dataclass(frozen=True)
class _Notices:
    kinds: frozenset[NotificationKind]
    # ``None`` covers target-less notices (Heart hunt never names its round).
    targets: frozenset[EngagementTarget] | None


_SURFACE_NOTICES: dict[GameNoticeSurface, _Notices] = {
    GameNoticeSurface.WHO_OF_US: _Notices(
        frozenset({NotificationKind.COUPLE_GAME_TURN}),
        frozenset({EngagementTarget.WHO_OF_US_GAME}),
    ),
    GameNoticeSurface.WISH_DETECTIVE: _Notices(
        frozenset({NotificationKind.COUPLE_GAME_TURN}),
        frozenset({EngagementTarget.WISH_DETECTIVE_GAME}),
    ),
    GameNoticeSurface.OUR_MOMENTS: _Notices(
        frozenset({NotificationKind.COUPLE_GAME_TURN}),
        frozenset({EngagementTarget.OUR_MOMENTS_GAME}),
    ),
    GameNoticeSurface.PICTURE_PING_PONG: _Notices(
        frozenset(
            {NotificationKind.PICTURE_PING_PONG_TURN, NotificationKind.PICTURE_PING_PONG_FINISHED}
        ),
        frozenset({EngagementTarget.PICTURE_GAME}),
    ),
    GameNoticeSurface.HEART_HUNT: _Notices(
        frozenset({NotificationKind.HEART_HUNT_HIDDEN, NotificationKind.HEART_HUNT_FOUND}),
        None,
    ),
    GameNoticeSurface.GARDEN: _Notices(
        # A bouquet reuses the seed notice kind with its own target.
        frozenset({NotificationKind.GARDEN_SEED_ARRIVED}),
        frozenset({EngagementTarget.GARDEN_SEED, EngagementTarget.GARDEN_BOUQUET}),
    ),
}


def mark_surface_notices_read(
    session: Session, context: AuthorizationContext, surface: GameNoticeSurface
) -> int:
    """Mark the reader's unread notices of one game page read; returns the count."""
    notices = _SURFACE_NOTICES[surface]
    return engagement.mark_notifications_read_for(
        session, context, kinds=notices.kinds, target_types=notices.targets
    )
