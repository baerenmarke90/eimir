"""The operator plugin is its own distribution on top of Core (#2189)."""

from __future__ import annotations

import re
from importlib.metadata import PackageNotFoundError, distribution, entry_points

import pytest

from eimir.plugins.contract import PLUGIN_SEAM_VERSION
from eimir.plugins.loader import PLUGIN_ENTRY_POINT_GROUP, installed_candidates, resolve_plugins
from eimir.plugins.manifest import ADMIN_CAPABILITIES, PRO_CAPABILITIES


def _installed(name: str) -> bool:
    try:
        distribution(name)
    except PackageNotFoundError:
        return False
    return True


requires_distribution = pytest.mark.skipif(
    not _installed("eimir-admin"),
    reason="the eimir-admin distribution is not installed in this environment",
)


@requires_distribution
def test_the_plugin_object_follows_the_seam() -> None:
    from eimir_admin.plugin import plugin

    assert plugin.name == "admin"
    assert plugin.seam_version == PLUGIN_SEAM_VERSION
    assert plugin.capabilities() == ADMIN_CAPABILITIES
    assert [router.prefix for router in plugin.routers()] == [
        "/server-admin/support-reports/templates",
        "/server-admin/support-reports",
    ]
    assert list(plugin.model_modules()) == [
        "eimir_admin.support_tickets.models",
        "eimir_admin.reply_templates.models",
    ]
    assert plugin.engagement_targets() == {}
    assert plugin.attachment_read_rules() == {}
    assert plugin.date_ideas() is None
    spec = plugin.migrations()
    assert spec is not None
    assert spec.version_table == "alembic_version_admin"


@requires_distribution
def test_the_admin_distribution_is_installed_on_top_of_core() -> None:
    requirements = distribution("eimir-admin").requires or []

    names = {re.split(r"[\s;<>=!~\[(@]", entry, maxsplit=1)[0] for entry in requirements}
    assert "eimir" in names


@requires_distribution
def test_the_entry_point_resolves_to_the_plugin_object() -> None:
    from eimir_admin.plugin import plugin

    matches = [
        entry_point
        for entry_point in entry_points(group=PLUGIN_ENTRY_POINT_GROUP)
        if entry_point.name == "admin"
    ]
    assert len(matches) == 1
    assert matches[0].dist is not None
    assert matches[0].dist.name == "eimir-admin"
    assert matches[0].load() is plugin


@requires_distribution
def test_both_real_plugins_load() -> None:
    from eimir.deployment.revision import build_revision

    if not _installed("eimir-pro"):
        pytest.skip("the eimir-pro distribution is not installed in this environment")
    loaded = resolve_plugins(
        ("pro", "admin"), installed_candidates(), core_revision=build_revision()
    )

    assert loaded.names == ("pro", "admin")
    assert not PRO_CAPABILITIES & ADMIN_CAPABILITIES
