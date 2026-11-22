"""Which of the couple's games currently wait on the reader (#2158 C).

One bounded read for Wir. It answers only *that* a game waits on the reader and
why, never what the game holds: no wish titles, clues, answers, drawings,
photos, heart positions, seed species or bouquet words leave this module.

"Waiting on me" follows the same rules that keep a game notice current
(``eimir.pro_plugin``), so Wir and the notification centre agree:

- Who of us, Wish detective, Our moments: the game is OPEN and its
  ``waiting_on_id`` is the reader. In Who of us nobody is waited on while both
  still answer; then the reader is waited on while they have unanswered
  questions. A FINISHED game's fresh result is not an action and does not count.
- Picture ping-pong: the picture is DRAWING and the reader is the drawer.
- Heart hunt: a HIDDEN round in which the reader is the seeker and whose photo
  is not due for deletion.
- Garden: a seed of today's shared calendar day sent to the reader and not
  planted yet (earlier seeds are planted automatically), and a bouquet for the
  reader that still waits on its card.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.recaps.service import calendar_context
from eimir_pro.couple_games.models import CoupleGame, CoupleGameKind, CoupleGameStatus
from eimir_pro.garden.models import GardenBouquet, GardenPlant
from eimir_pro.heart_hunt.models import HeartHuntRound, HeartRoundState
from eimir_pro.picture_ping_pong.models import PicturePingPong, PictureStatus


class WaitingGameKind(StrEnum):
    WHO_OF_US = "WHO_OF_US"
    WISH_DETECTIVE = "WISH_DETECTIVE"
    OUR_MOMENTS = "OUR_MOMENTS"
    PICTURE_PING_PONG = "PICTURE_PING_PONG"
    HEART_HUNT = "HEART_HUNT"
    GARDEN_SEED = "GARDEN_SEED"
    GARDEN_BOUQUET = "GARDEN_BOUQUET"


class WaitingGameReason(StrEnum):
    """What the reader is asked to do; the client words it."""

    ANSWER = "ANSWER"
    TURN = "TURN"
    DRAW = "DRAW"
    SEEK = "SEEK"
    PLANT = "PLANT"
    OPEN_BOUQUET = "OPEN_BOUQUET"


@dataclass(frozen=True)
class WaitingGame:
    kind: WaitingGameKind
    reason: WaitingGameReason
    since: datetime


_COUPLE_GAME_REASONS = {
    CoupleGameKind.WHO_OF_US: (WaitingGameKind.WHO_OF_US, WaitingGameReason.ANSWER),
    CoupleGameKind.WISH_DETECTIVE: (WaitingGameKind.WISH_DETECTIVE, WaitingGameReason.TURN),
    CoupleGameKind.OUR_MOMENTS: (WaitingGameKind.OUR_MOMENTS, WaitingGameReason.TURN),
}


def _who_of_us_waits_on_reader(game: CoupleGame, account_id: UUID) -> bool:
    """While both still answer, the reader is waited on until they answered all."""
    data = game.payload.who_of_us
    if data is None:
        return False
    return len(data.answers.get(account_id, {})) < len(data.question_ids)


def waiting_games(session: Session, context: AuthorizationContext) -> list[WaitingGame]:
    """Every game that currently waits on the reader, newest first."""
    me = context.account_id
    found: list[WaitingGame] = []

    for game in session.scalars(
        select(CoupleGame).where(
            CoupleGame.space_id == context.space_id,
            CoupleGame.status == CoupleGameStatus.OPEN.value,
        )
    ):
        kind, reason = _COUPLE_GAME_REASONS[CoupleGameKind(game.game)]
        if game.waiting_on_id == me or (
            game.waiting_on_id is None
            and kind is WaitingGameKind.WHO_OF_US
            and _who_of_us_waits_on_reader(game, me)
        ):
            found.append(WaitingGame(kind, reason, clock.ensure_utc(game.updated_at)))

    picture = session.scalar(
        select(PicturePingPong.updated_at)
        .where(
            PicturePingPong.space_id == context.space_id,
            PicturePingPong.status == PictureStatus.DRAWING.value,
            PicturePingPong.drawer_id == me,
        )
        .order_by(PicturePingPong.updated_at.desc())
        .limit(1)
    )
    if picture is not None:
        found.append(
            WaitingGame(
                WaitingGameKind.PICTURE_PING_PONG,
                WaitingGameReason.DRAW,
                clock.ensure_utc(picture),
            )
        )

    hidden = session.scalar(
        select(HeartHuntRound.created_at)
        .where(
            HeartHuntRound.space_id == context.space_id,
            HeartHuntRound.seeker_id == me,
            HeartHuntRound.state == HeartRoundState.HIDDEN.value,
            HeartHuntRound.purge_after > clock.now(),
        )
        .order_by(HeartHuntRound.created_at.desc())
        .limit(1)
    )
    if hidden is not None:
        found.append(
            WaitingGame(
                WaitingGameKind.HEART_HUNT, WaitingGameReason.SEEK, clock.ensure_utc(hidden)
            )
        )

    zone, _ = calendar_context(session, context)
    seed = session.scalar(
        select(GardenPlant.created_at)
        .where(
            GardenPlant.space_id == context.space_id,
            GardenPlant.receiver_id == me,
            GardenPlant.planted_at.is_(None),
            # Earlier seeds are planted automatically when the garden opens.
            GardenPlant.sent_on >= clock.today_in(zone),
        )
        .order_by(GardenPlant.created_at.desc())
        .limit(1)
    )
    if seed is not None:
        found.append(
            WaitingGame(
                WaitingGameKind.GARDEN_SEED, WaitingGameReason.PLANT, clock.ensure_utc(seed)
            )
        )

    bouquet = session.scalar(
        select(GardenBouquet.created_at)
        .where(
            GardenBouquet.space_id == context.space_id,
            GardenBouquet.receiver_id == me,
            GardenBouquet.closed_at.is_(None),
        )
        .order_by(GardenBouquet.created_at.desc())
        .limit(1)
    )
    if bouquet is not None:
        found.append(
            WaitingGame(
                WaitingGameKind.GARDEN_BOUQUET,
                WaitingGameReason.OPEN_BOUQUET,
                clock.ensure_utc(bouquet),
            )
        )

    return sorted(found, key=lambda item: item.since, reverse=True)
