"""Cross-layer parity guard for the #817 Dashboard module catalog.

`web/src/client/dashboardModuleCatalog.contract.json` is the single
authoritative, ordered list of module keys. This test proves the backend
`CATALOG` matches it exactly; `web/src/client/dashboardModules.test.ts`
proves the Web catalog matches the same file. Neither layer is allowed to
define its own opinion of "the" module list - a module registered on only
one side, or registered in a different order, fails one of these two tests
rather than silently drifting.
"""

from __future__ import annotations

import json
from pathlib import Path

from eimir.dashboard.preferences import CATALOG

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CONTRACT_PATH = _REPO_ROOT / "web" / "src" / "client" / "dashboardModuleCatalog.contract.json"


def _authoritative_module_keys() -> list[str]:
    contract = json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
    keys = contract["moduleKeys"]
    assert isinstance(keys, list)
    assert all(isinstance(key, str) for key in keys)
    return keys


def test_contract_file_exists_and_is_non_empty() -> None:
    assert _CONTRACT_PATH.is_file(), f"Missing authoritative catalog contract: {_CONTRACT_PATH}"
    assert len(_authoritative_module_keys()) > 0


def test_backend_catalog_matches_the_authoritative_key_order_exactly() -> None:
    backend_keys = [definition.key.value for definition in CATALOG]
    assert backend_keys == _authoritative_module_keys(), (
        "backend CATALOG has drifted from dashboard-module-catalog.json. "
        "Update both together (and the Web catalog) when adding, renaming, "
        "or reordering a Dashboard module."
    )
