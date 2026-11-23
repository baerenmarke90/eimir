"""The Pro plugin is its own distribution on top of Core (Decision 0017, Phase 2, #2182)."""

from __future__ import annotations

import re
from importlib.metadata import distribution


def test_the_pro_distribution_is_installed_on_top_of_core() -> None:
    requirements = distribution("eimir-pro").requires or []

    names = {re.split(r"[\s;<>=!~\[(@]", entry, maxsplit=1)[0] for entry in requirements}
    assert "eimir" in names


def test_the_core_only_view_of_the_pro_routes_is_exact() -> None:
    # Without this package, Core tests derive the Pro routes from the contract
    # plus a short list of routes hidden from it. That list must stay complete.
    from tests.support.plugins import (
        HIDDEN_PRO_OPERATIONS,
        contract_pro_operations,
        operation_key,
        plugin_route_operations,
    )

    derived = contract_pro_operations() | HIDDEN_PRO_OPERATIONS
    assert {operation_key(*item) for item in derived} == {
        operation_key(*item) for item in plugin_route_operations()
    }
