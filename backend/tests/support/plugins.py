"""Run Core code as if no plugin were loaded (Decision 0017, Core-only behavior)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from eimir.plugins import loader


@contextmanager
def without_plugins() -> Iterator[None]:
    """Make ``loaded_plugins()`` report no plugin inside the block.

    Data is usually created with the plugin loaded (through its routes and
    services) and the lifecycle step under test then runs Core-only, the state
    of an instance that once ran with the plugin.
    """
    loaded = loader.loaded_plugins()
    loader._loaded = loader.LoadedPlugins(())
    try:
        yield
    finally:
        loader._loaded = loaded
