"""One current picture per Space; strokes only, never a rendered image.

The picture is a bounded list of normalized strokes. The rendered image exists
only when a partner deliberately saves it to Momente through the ordinary
Memory/media path (the Memory then owns it). The row never stores location,
distance or timing data, and there is no history beyond the current picture.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sqlalchemy import Boolean, CheckConstraint, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload

MAX_TURNS = 6
MAX_STROKES_PER_TURN = 3
# A stroke is a flat [x0, y0, x1, y1, ...] list on a 0..1000 grid.
GRID = 1000
MIN_STROKE_VALUES = 4
MAX_STROKE_VALUES = 480
SEED_TURN = 0


class PictureStatus(StrEnum):
    DRAWING = "DRAWING"
    FINISHED = "FINISHED"


class PictureStarter(StrEnum):
    """How a new picture begins: with the gentle seed squiggle or a blank page."""

    SQUIGGLE = "SQUIGGLE"
    BLANK = "BLANK"


class PictureColour(StrEnum):
    # Semantic colour slots; each client resolves them to design tokens.
    PERSON = "PERSON"
    INK = "INK"
    SUN = "SUN"


class PictureStroke(BaseModel):
    model_config = ConfigDict(extra="forbid")

    turn: int
    author_id: UUID | None = None
    colour: Literal["PERSON", "INK", "SUN"]
    points: list[int]


class PicturePayload(ProtectedPayload):
    strokes: list[PictureStroke]


class PicturePingPong(IdMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "picture_ping_pong"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    started_by: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    # Whose turn it is; absent once the picture is finished.
    drawer_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True), nullable=True)
    turns_done: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    finished_early: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    saved_memory_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("memories.id", ondelete="SET NULL")
    )
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    payload: Mapped[PicturePayload] = mapped_column(
        ProtectedPayloadJSON(PicturePayload), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("space_id", name="uq_picture_ping_pong_space"),
        CheckConstraint("status IN ('DRAWING', 'FINISHED')", name="status_allowed"),
        CheckConstraint("turns_done BETWEEN 0 AND 6", name="turns_bounded"),
        CheckConstraint(
            "(status = 'DRAWING' AND drawer_id IS NOT NULL)"
            " OR (status = 'FINISHED' AND drawer_id IS NULL)",
            name="drawer_matches_status",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
