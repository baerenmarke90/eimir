"""The in-tree Pro plugin object (Decision 0017, Phase 1).

The Premium-only modules still live in this distribution. This object is what
Core sees of them through the seam; it is registered as the entry point ``pro``
of the group ``eimir.plugins`` in ``pyproject.toml``. It names its modules as
strings, so importing it imports no Pro code. Its hooks grow with each Phase 1
pull request until Core reaches Pro only through them.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from eimir.deployment.revision import build_revision
from eimir.entitlements.models import Capability
from eimir.plugins.contract import PLUGIN_SEAM_VERSION

if TYPE_CHECKING:
    from fastapi import APIRouter

_CAPABILITIES = frozenset(
    {
        Capability.GAMES_COUPLE.value,
        Capability.INTEGRATION_EXTERNAL_SYNC.value,
        Capability.PARTNER_ONCE_MESSAGES.value,
        Capability.PRESENCE_LOCATION.value,
        Capability.DAILY_QUOTE.value,
        Capability.PLANNING_DATE_INSPIRATION.value,
    }
)

_MODEL_MODULES = (
    "eimir.calendar_sync.models",
    "eimir.couple_games.models",
    "eimir.garden.models",
    "eimir.heart_hunt.models",
    "eimir.once_messages.models",
    "eimir.photo_sources.models",
    "eimir.picture_ping_pong.models",
    "eimir.presence.models",
    "eimir.quotes.models",
)


class InTreeProPlugin:
    """The Pro plugin while its code is part of the ``eimir`` distribution."""

    name = "pro"
    seam_version = PLUGIN_SEAM_VERSION

    @property
    def core_revision(self) -> str:
        # Built from the same tree as Core, so it is Core's own revision.
        return build_revision()

    def capabilities(self) -> frozenset[str]:
        return _CAPABILITIES

    def model_modules(self) -> Sequence[str]:
        return _MODEL_MODULES

    def routers(self) -> Sequence[APIRouter]:
        # Core still mounts the Pro routers itself; they move here in a later
        # Phase 1 pull request, together with the Core-only configuration.
        return ()


plugin = InTreeProPlugin()
