"""Owner-only app-icon selection for an Account in one Space."""

from enum import StrEnum
from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin


class AppIconId(StrEnum):
    ORIGINAL = "original"
    SUNSET = "sunset"
    SAGE = "sage"
    DAYLIGHT = "daylight"
    LAVENDER = "lavender"
    SAND = "sand"
    MIDNIGHT = "midnight"
    PEARL = "pearl"
    DARK = "dark"
    MONOCHROME = "monochrome"
    MINIMAL = "minimal"


class WirDesignId(StrEnum):
    CONNECTED = "connected"
    WARM = "warm"
    SHARED_ALBUM = "shared_album"
    MODERN = "modern"
    CLASSIC = "classic"
    QUIET_TOGETHER = "quiet_together"
    HOME_ROOMS = "home_rooms"
    SHARED_RHYTHM = "shared_rhythm"


class PersonColoursId(StrEnum):
    """A fixed pair: the owner's own colour first, then the partner's colour.

    The pair is a purely personal view setting. It is never shared with the
    partner, so the two people can see each other in different colours.
    """

    ROSE_BLUE = "rose_blue"
    BLUE_ROSE = "blue_rose"
    ROSE_DEEPROSE = "rose_deeprose"
    DEEPROSE_ROSE = "deeprose_rose"
    BLUE_DEEPBLUE = "blue_deepblue"
    DEEPBLUE_BLUE = "deepblue_blue"
    MOSS_ROSE = "moss_rose"
    MOSS_BLUE = "moss_blue"


class MemoryWorldId(StrEnum):
    """A personal presentation of the rediscovered memories in Momente (#2283).

    A world only changes how the same rediscovery selection is shown. It is a
    personal view setting that is never shared with the partner.
    """

    STORY = "story"
    STACK = "stack"
    CRATE = "crate"


# Product Owner decision 2026-11-14: "connected" is the default composition and,
# like "warm", Free. Every other design requires ``theme.bespoke_packs``.
DEFAULT_WIR_DESIGN = WirDesignId.CONNECTED
FREE_WIR_DESIGNS = frozenset({WirDesignId.CONNECTED, WirDesignId.WARM})

# #2283: the Story presentation is the default and, like the Stapel world, Free.
# Every other memory world requires ``theme.bespoke_packs``.
DEFAULT_MEMORY_WORLD = MemoryWorldId.STORY
FREE_MEMORY_WORLDS = frozenset({MemoryWorldId.STORY, MemoryWorldId.STACK})


class AppIconPreference(IdMixin, TimestampMixin, VersionMixin, Base):
    """Personal system metadata; partners do not share the selected icon."""

    __tablename__ = "app_icon_preferences"
    __table_args__ = (UniqueConstraint("account_id", "space_id"),)

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    icon_id: Mapped[str] = mapped_column(String(24), nullable=False)
    wir_design: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default=DEFAULT_WIR_DESIGN.value,
        server_default=DEFAULT_WIR_DESIGN.value,
    )
    # NULL means "automatic": the clients keep the shared-list look of #1808.
    person_colours: Mapped[str | None] = mapped_column(String(24), nullable=True)
    # NULL follows the palette of the selected app design.
    wir_design_palette: Mapped[str | None] = mapped_column(String(24), nullable=True)
    # NULL means the default Story presentation.
    memory_world: Mapped[str | None] = mapped_column(String(24), nullable=True)

    @property
    def effective_wir_design(self) -> WirDesignId:
        """Resolve a retired selection from an older installation or database."""
        if self.wir_design in {"handwriting", "together_index"}:
            return DEFAULT_WIR_DESIGN
        return WirDesignId(self.wir_design)

    @property
    def effective_palette(self) -> WirDesignId | None:
        palette = self.wir_design_palette
        if palette is not None and palette in WirDesignId:
            return WirDesignId(palette)
        return None

    @property
    def effective_memory_world(self) -> MemoryWorldId:
        """Resolve no choice, or a world unknown to this installation, to the default."""
        world = self.memory_world
        if world is not None and world in MemoryWorldId:
            return MemoryWorldId(world)
        return DEFAULT_MEMORY_WORLD
