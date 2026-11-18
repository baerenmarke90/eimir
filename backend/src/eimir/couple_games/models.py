"""One remote game per Space and game type, played on two devices.

The pass-and-play games "Who of us", "Wish detective" and "Our moments" can
also be played at a distance: each partner plays on their own phone, at their own pace. The row
keeps the current (or last) game of each type; a new game replaces a finished
or ended one. Answers, clues and guesses live in a protected payload. The
plain columns hold only what authorization and notice currency need: the
status and whose move it is. Wishes and Memories are referenced by id; their
titles and images are always read live through the ordinary authorization and
never copied here.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload

# Owned editorial ids; the question wording stays in client localization and
# mirrors ``WHO_OF_US_QUESTION_IDS`` in web/src/client/whoOfUsSession.ts.
WHO_OF_US_QUESTION_IDS = (
    "morningLonger",
    "movieSleeper",
    "spontaneous",
    "travelPlanner",
    "sameFood",
    "wrongLyrics",
    "snack",
    "packing",
)

WISH_DETECTIVE_MAX_ROUNDS_PER_PARTNER = 4
WISH_DETECTIVE_MIN_ROUNDS_PER_PARTNER = 1
WISH_DETECTIVE_SKIPS_PER_ROUND = 3
WISH_DETECTIVE_CLUE_COUNT = 3
WISH_DETECTIVE_MAX_CLUE_INPUT = 64
WISH_DETECTIVE_MAX_GUESS_LENGTH = 200

# Same board size rule as selectOurMomentsRound in ourMomentsSession.ts.
OUR_MOMENTS_MIN_PAIRS = 3
OUR_MOMENTS_MAX_PAIRS = 4


class CoupleGameKind(StrEnum):
    WHO_OF_US = "WHO_OF_US"
    WISH_DETECTIVE = "WISH_DETECTIVE"
    OUR_MOMENTS = "OUR_MOMENTS"


class CoupleGameStatus(StrEnum):
    OPEN = "OPEN"
    FINISHED = "FINISHED"
    # Either partner may end an open game early; what was played stays readable.
    ENDED = "ENDED"


class WishDetectivePhase(StrEnum):
    CLUE = "CLUE"
    GUESS = "GUESS"


class WishDetectiveResult(StrEnum):
    CORRECT = "CORRECT"
    INCORRECT = "INCORRECT"
    PASSED = "PASSED"
    # The wish was deleted before the guess could be judged; nobody scores.
    VOID = "VOID"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WhoOfUsData(_Strict):
    question_ids: list[str]
    # answering partner -> question id -> the partner the answer points to
    answers: dict[UUID, dict[str, UUID]] = Field(default_factory=dict)


class WishDetectiveRound(_Strict):
    giver_id: UUID
    wish_id: UUID
    skips: int = 0
    clues: list[str] = Field(default_factory=list)
    guess: str | None = None
    result: WishDetectiveResult | None = None


class WishDetectiveData(_Strict):
    rounds_total: int
    rounds: list[WishDetectiveRound] = Field(default_factory=list)
    # Every wish drawn in this game (played or skipped), so none repeats.
    drawn_wish_ids: list[UUID] = Field(default_factory=list)


class OurMomentsCard(_Strict):
    memory_id: UUID
    attachment_id: UUID
    face: Literal["PHOTO", "CONTEXT"]


class OurMomentsTurn(_Strict):
    player_id: UUID
    positions: list[int]
    matched: bool


class OurMomentsData(_Strict):
    # Board positions are list indexes; fixed when the game starts.
    cards: list[OurMomentsCard]
    matched: list[int] = Field(default_factory=list)
    # The first card of the current turn, until the second one is flipped.
    flipped: list[int] = Field(default_factory=list)
    flips_done: int = 0
    scores: dict[UUID, int] = Field(default_factory=dict)
    last_turn: OurMomentsTurn | None = None


class CoupleGamePayload(ProtectedPayload):
    who_of_us: WhoOfUsData | None = None
    wish_detective: WishDetectiveData | None = None
    our_moments: OurMomentsData | None = None


class CoupleGame(IdMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "couple_games"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    game: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    started_by: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    ended_by: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True), nullable=True)
    # The partner the game waits on: whose move it is while open (absent in
    # Who of us while both still answer), and the partner with a fresh result
    # once finished. A notice for the game is current only for this partner.
    waiting_on_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True), nullable=True)
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    payload: Mapped[CoupleGamePayload] = mapped_column(
        ProtectedPayloadJSON(CoupleGamePayload), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("space_id", "game", name="uq_couple_games_space_game"),
        CheckConstraint(
            "game IN ('WHO_OF_US', 'WISH_DETECTIVE', 'OUR_MOMENTS')", name="game_allowed"
        ),
        CheckConstraint("status IN ('OPEN', 'FINISHED', 'ENDED')", name="status_allowed"),
        CheckConstraint(
            "status <> 'ENDED' OR waiting_on_id IS NULL", name="nobody_waited_on_once_ended"
        ),
        CheckConstraint(
            "(status = 'ENDED') = (ended_by IS NOT NULL)", name="ended_by_matches_status"
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
