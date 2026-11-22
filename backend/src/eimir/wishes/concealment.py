"""Wishes a game in progress hides from one reader (#2158 H).

While a remote Wish detective game is open, the guesser must not find the
answer in the Wishes tab. The game is plugin code (Decision 0017), so Core
asks the loaded plugins which Wishes are hidden for this reader; without a
plugin nothing is hidden. Unlike a discreet Plan this is not only a visual
shield: the read models leave out every authored field of a hidden Wish and
the reader's own writes to it are refused, until the game reveals it.
Authorization is unchanged: the Wish stays readable, and its existence and
creator stay visible so lists keep their shape.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError

WISH_HIDDEN_DURING_GAME = "WISH_HIDDEN_DURING_GAME"


def hidden_wish_ids(session: Session, context: AuthorizationContext) -> frozenset[UUID]:
    """The Wishes whose content the reader must not see right now."""
    from eimir.plugins.loader import loaded_plugins

    return loaded_plugins().hidden_wish_ids(session, context)


def ensure_visible(session: Session, context: AuthorizationContext, wish_id: UUID) -> None:
    """Refuse a write of the reader to a Wish a game currently hides from them."""
    if wish_id in hidden_wish_ids(session, context):
        raise ConflictError(
            "This Wish is part of an open game and stays hidden until it is revealed.",
            WISH_HIDDEN_DURING_GAME,
        )
