"""The contract between Core and a plugin (Decision 0017, decision 3).

The seam is internal to the eimir. product and promises no compatibility to
third parties. Core and plugin are built from the same revision, so the seam
version only has to tell two builds apart: raise ``PLUGIN_SEAM_VERSION``
whenever this Protocol, the manifest format or a hook signature changes, and
update the plugin in the same change.

Hooks that need a database receive the caller's ``Session`` and never commit,
roll back or open their own transaction. Each hook lands together with the
Core call site it replaces; this revision covers the plugin identity,
capabilities, model modules and routers.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    from fastapi import APIRouter

PLUGIN_SEAM_VERSION = 1
"""The seam revision Core implements. A plugin declaring another value refuses to start."""

PLUGIN_ENTRY_POINT_GROUP = "eimir.plugins"
"""The entry-point group in which a distribution registers its plugin object."""


@runtime_checkable
class ProPlugin(Protocol):
    """One plugin object, registered under ``PLUGIN_ENTRY_POINT_GROUP``."""

    @property
    def name(self) -> str:
        """Equal to the entry-point name and the name in ``EIMIR_PLUGINS``."""
        ...

    @property
    def seam_version(self) -> int:
        """The ``PLUGIN_SEAM_VERSION`` the plugin was written against."""
        ...

    @property
    def core_revision(self) -> str:
        """The Core build revision the plugin was built against (``EIMIR_BUILD_REVISION``)."""
        ...

    def capabilities(self) -> frozenset[str]:
        """Return the ``Capability`` values this plugin implements. Read once at startup."""
        ...

    def model_modules(self) -> Sequence[str]:
        """Return the import paths of the plugin's ORM model modules.

        Core imports them so ``Base.metadata`` is complete. Lifecycle
        correctness never depends on this hook: the Core manifest
        (``eimir.plugins.manifest``) describes every plugin table on its own.
        """
        ...

    def routers(self) -> Sequence[APIRouter]:
        """Return the routers Core mounts under ``/api/v1`` behind normal operation."""
        ...
