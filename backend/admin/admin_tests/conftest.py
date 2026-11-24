"""Shared setup of the operator plugin tests (#2189).

The plugin is a separate distribution on top of Core. The metadata tests need no
database. The integration tests reuse the Core fixtures (database engine and
session) the same way the Pro tests do.
"""

from __future__ import annotations

import importlib.util

# Importing the Core conftest also applies its test environment defaults. The
# fixtures are re-exported so they reach the operator plugin tests.
from tests.conftest import (  # noqa: F401  (pytest fixtures)
    _media_root,
    _restore_pillow_pixel_limit,
    engine,
    session,
)

# The Core-only configuration installs no operator distribution. Its modules are
# not even imported there (no skip records either, which the Core-only skip-reason
# check in CI would flag), exactly as the Pro feature tests are not collected.
collect_ignore_glob = ["*"] if importlib.util.find_spec("eimir_admin") is None else []
