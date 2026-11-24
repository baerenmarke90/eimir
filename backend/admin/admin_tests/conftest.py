"""Shared setup of the operator plugin tests (#2189).

The plugin is a separate distribution on top of Core. The metadata tests need no
database. The integration tests reuse the Core fixtures (database engine and
session) the same way the Pro tests do.
"""

from __future__ import annotations

# Importing the Core conftest also applies its test environment defaults. The
# fixtures are re-exported so they reach the operator plugin tests.
from tests.conftest import (  # noqa: F401  (pytest fixtures)
    _media_root,
    _restore_pillow_pixel_limit,
    engine,
    session,
)
