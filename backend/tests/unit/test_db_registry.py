"""Standalone ORM model-registry completeness."""

from __future__ import annotations

from eimir.db.base import Base
from eimir.db.registry import MODEL_MODULES, load_all_models


def test_shared_create_receipts_are_available_to_standalone_metadata_consumers() -> None:
    assert "eimir.create_receipts.models" in MODEL_MODULES

    load_all_models()

    assert "create_receipts" in Base.metadata.tables
