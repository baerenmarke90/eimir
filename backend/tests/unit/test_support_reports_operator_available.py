"""The ServerAdmin overview advertises the support operator plugin (#2189)."""

from __future__ import annotations

from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest

from eimir.api.v1.server_admin import support_reports_operator_available
from eimir.entitlements.models import Capability
from eimir.plugins import loader


def _plugin(name: str, *capabilities: str) -> Any:
    return SimpleNamespace(name=name, capabilities=lambda: frozenset(capabilities))


@pytest.fixture
def loaded() -> Iterator[Any]:
    previous = loader._loaded

    def install(*plugins: Any) -> None:
        loader._loaded = loader.LoadedPlugins(tuple(plugins))

    try:
        yield install
    finally:
        loader._loaded = previous


def test_false_with_core_only(loaded: Any) -> None:
    loaded()
    assert support_reports_operator_available(enabled=True) is False


def test_false_with_only_pro_loaded(loaded: Any) -> None:
    loaded(_plugin("pro", Capability.MEDIA_VIDEO_UPLOAD.value))
    assert support_reports_operator_available(enabled=True) is False


def test_true_with_operator_plugin_and_feature_on(loaded: Any) -> None:
    loaded(_plugin("admin", Capability.SUPPORT_OPERATOR.value))
    assert support_reports_operator_available(enabled=True) is True


def test_false_with_operator_plugin_and_feature_off(loaded: Any) -> None:
    loaded(_plugin("admin", Capability.SUPPORT_OPERATOR.value))
    assert support_reports_operator_available(enabled=False) is False
