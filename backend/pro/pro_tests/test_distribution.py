"""The Pro plugin is its own distribution on top of Core (Decision 0017, Phase 2, #2182)."""

from __future__ import annotations

import re
from importlib.metadata import distribution


def test_the_pro_distribution_is_installed_on_top_of_core() -> None:
    requirements = distribution("eimir-pro").requires or []

    names = {re.split(r"[\s;<>=!~\[(@]", entry, maxsplit=1)[0] for entry in requirements}
    assert "eimir" in names
