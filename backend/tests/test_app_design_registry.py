"""Design token files (#1907 C1) agree with the server's stored design ids and Free list."""

import json
from pathlib import Path

from eimir.appearance.models import FREE_WIR_DESIGNS, WirDesignId

DESIGNS = Path(__file__).parents[2] / "design" / "designs"


def test_every_design_file_names_a_stored_design_with_the_server_tier() -> None:
    files = sorted(DESIGNS.glob("*.json"))
    assert files
    for path in files:
        design = json.loads(path.read_text(encoding="utf-8"))
        design_id = WirDesignId(design["id"])
        assert path.stem == design_id.value
        assert (design["tier"] == "free") == (design_id in FREE_WIR_DESIGNS), path.name
