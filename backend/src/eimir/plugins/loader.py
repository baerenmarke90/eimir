"""Resolve the allow-listed plugins once per process (Decision 0017, decisions 1, 2 and 5).

``EIMIR_PLUGINS`` names the plugins to load (comma-separated entry-point names
of the group ``eimir.plugins``). The ``api``, ``worker`` and ``migrate``
processes all resolve them through ``loaded_plugins()``. A named plugin that is
missing, provided twice or by a foreign distribution, fails to import, has
another seam version, was built against another Core revision or declares an
unknown capability refuses to start the process, and so does a plugin route
that collides with a Core route: a broken Pro deployment must fail its health
gate instead of serving Free. An installed plugin that is not named is ignored.
"""

from __future__ import annotations

import logging
import re
import threading
from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from importlib import import_module
from importlib.metadata import entry_points
from typing import TYPE_CHECKING

from fastapi.routing import iter_route_contexts

from eimir.config import PluginSettings
from eimir.deployment.revision import UNVERIFIED_REVISION, build_revision
from eimir.entitlements.models import Capability
from eimir.plugins.contract import (
    PLUGIN_ENTRY_POINT_GROUP,
    PLUGIN_SEAM_VERSION,
    AttachmentReadRule,
    ProPlugin,
    TargetRule,
)
from eimir.plugins.manifest import PLUGIN_ENGAGEMENT_TARGETS, PLUGIN_JOB_KINDS, attachment_rules

if TYPE_CHECKING:
    from fastapi import APIRouter
    from starlette.routing import BaseRoute

    from eimir.engagement.models import EngagementTarget
    from eimir.jobs.worker import JobRegistry

log = logging.getLogger(__name__)

EXPECTED_DISTRIBUTIONS = {"pro": "eimir"}
"""The only distribution allowed to provide each plugin name.

While the plugin is in-tree (Phase 1) it ships in the ``eimir`` distribution
itself; Phase 2 moves it into its own distribution.
"""


class PluginLoadError(RuntimeError):
    """A named plugin cannot be loaded safely; the process must not start."""


@dataclass(frozen=True)
class PluginCandidate:
    """One installed entry point of the plugin group, not yet imported."""

    name: str
    distribution: str | None
    load: Callable[[], object]


@dataclass(frozen=True)
class LoadedPlugins:
    """The plugins this process resolved, in ``EIMIR_PLUGINS`` order."""

    plugins: tuple[ProPlugin, ...]

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(plugin.name for plugin in self.plugins)

    def capabilities(self) -> frozenset[str]:
        provided: set[str] = set()
        for plugin in self.plugins:
            provided |= plugin.capabilities()
        return frozenset(provided)

    def model_modules(self) -> tuple[str, ...]:
        return tuple(module for plugin in self.plugins for module in plugin.model_modules())

    def engagement_targets(self) -> dict[EngagementTarget, TargetRule]:
        return {
            target: rule
            for plugin in self.plugins
            for target, rule in plugin.engagement_targets().items()
        }

    def attachment_read_rules(self) -> dict[str, AttachmentReadRule]:
        return {
            parent_type: rule
            for plugin in self.plugins
            for parent_type, rule in plugin.attachment_read_rules().items()
        }

    def register_jobs(self, registry: JobRegistry) -> None:
        """Register every plugin's job handlers; a kind the manifest does not declare refuses."""
        for plugin in self.plugins:
            before = registry.kinds()
            plugin.register_jobs(registry)
            undeclared = sorted(registry.kinds() - before - PLUGIN_JOB_KINDS)
            if undeclared:
                raise PluginLoadError(
                    f"Plugin {plugin.name!r} registers job kinds the Core manifest does not "
                    f"declare: {', '.join(undeclared)}."
                )

    @staticmethod
    def unclaimed_job_kinds(registry: JobRegistry) -> frozenset[str]:
        """Plugin job kinds without a handler here; a worker leaves them for a plugin worker."""
        return PLUGIN_JOB_KINDS - registry.kinds()


def parse_plugin_names(raw: str) -> tuple[str, ...]:
    """Split the ``EIMIR_PLUGINS`` value; an empty value means Core only."""
    names = tuple(part.strip() for part in raw.split(",") if part.strip())
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise PluginLoadError(
            f"EIMIR_PLUGINS names a plugin more than once: {', '.join(duplicates)}."
        )
    return names


def installed_candidates() -> list[PluginCandidate]:
    """Every entry point of the plugin group in the installed environment."""
    return [
        PluginCandidate(
            name=entry_point.name,
            distribution=entry_point.dist.name if entry_point.dist is not None else None,
            load=entry_point.load,
        )
        for entry_point in entry_points(group=PLUGIN_ENTRY_POINT_GROUP)
    ]


def _normalized(distribution: str | None) -> str | None:
    # Distribution names compare in their normalized form (PEP 503).
    if distribution is None:
        return None
    return re.sub(r"[-_.]+", "-", distribution).lower()


def _load_one(name: str, candidates: Sequence[PluginCandidate], core_revision: str) -> ProPlugin:
    expected = EXPECTED_DISTRIBUTIONS.get(name)
    if expected is None:
        raise PluginLoadError(
            f"EIMIR_PLUGINS names the unknown plugin {name!r}; known plugins: "
            f"{', '.join(sorted(EXPECTED_DISTRIBUTIONS))}."
        )
    if not candidates:
        raise PluginLoadError(
            f"Plugin {name!r} is named in EIMIR_PLUGINS but not installed: no entry point "
            f"{name!r} in group {PLUGIN_ENTRY_POINT_GROUP!r}. Run from the installed "
            "environment (uv sync) or remove the name from EIMIR_PLUGINS."
        )
    if len(candidates) > 1:
        sources = ", ".join(sorted(str(candidate.distribution) for candidate in candidates))
        raise PluginLoadError(f"Plugin {name!r} is provided more than once ({sources}).")
    candidate = candidates[0]
    if _normalized(candidate.distribution) != _normalized(expected):
        raise PluginLoadError(
            f"Plugin {name!r} is provided by distribution {candidate.distribution!r}, "
            f"expected {expected!r}."
        )
    try:
        plugin = candidate.load()
    except Exception as error:
        raise PluginLoadError(f"Plugin {name!r} failed to import: {error}") from error
    if not isinstance(plugin, ProPlugin):
        raise PluginLoadError(f"Plugin {name!r} does not implement the plugin contract.")
    if plugin.name != name:
        raise PluginLoadError(f"Entry point {name!r} provides a plugin named {plugin.name!r}.")
    if plugin.seam_version != PLUGIN_SEAM_VERSION:
        raise PluginLoadError(
            f"Plugin {name!r} implements seam version {plugin.seam_version}, "
            f"Core implements {PLUGIN_SEAM_VERSION}."
        )
    # A local checkout has no build identity; only the seam version is checked there.
    if core_revision != UNVERIFIED_REVISION and plugin.core_revision != core_revision:
        raise PluginLoadError(
            f"Plugin {name!r} was built against Core revision {plugin.core_revision!r}, "
            f"this Core is {core_revision!r}."
        )
    known = {capability.value for capability in Capability}
    unknown = sorted(plugin.capabilities() - known)
    if unknown:
        raise PluginLoadError(
            f"Plugin {name!r} declares unknown capabilities: {', '.join(unknown)}."
        )
    undeclared_targets = sorted(
        target.value for target in set(plugin.engagement_targets()) - PLUGIN_ENGAGEMENT_TARGETS
    )
    if undeclared_targets:
        raise PluginLoadError(
            f"Plugin {name!r} decides notification targets the Core manifest does not declare: "
            f"{', '.join(undeclared_targets)}."
        )
    parent_types = {rule.parent_type for _, rule in attachment_rules()}
    undeclared_parents = sorted(set(plugin.attachment_read_rules()) - parent_types)
    if undeclared_parents:
        raise PluginLoadError(
            f"Plugin {name!r} reads attachment parents the Core manifest does not declare: "
            f"{', '.join(undeclared_parents)}."
        )
    for module in plugin.model_modules():
        try:
            import_module(module)
        except Exception as error:
            raise PluginLoadError(
                f"Plugin {name!r} model module {module!r} failed to import: {error}"
            ) from error
    return plugin


def resolve_plugins(
    names: Sequence[str],
    candidates: Iterable[PluginCandidate],
    *,
    core_revision: str,
) -> LoadedPlugins:
    """Load exactly the named plugins or raise ``PluginLoadError``."""
    by_name: defaultdict[str, list[PluginCandidate]] = defaultdict(list)
    for candidate in candidates:
        by_name[candidate.name].append(candidate)
    for ignored in sorted(set(by_name) - set(names)):
        log.info("Installed plugin %r is not named in EIMIR_PLUGINS and stays unloaded.", ignored)
    return LoadedPlugins(tuple(_load_one(name, by_name[name], core_revision) for name in names))


_ROUTE_PARAMETER = re.compile(r"\{[^}]*\}")


def _route_keys(routes: Sequence[BaseRoute], prefix: str = "") -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    # Included routers are resolved lazily; the route contexts are their effective routes.
    for route in iter_route_contexts(routes):
        path = route.path
        if path is None:
            continue
        # "/x/{id}" and "/x/{space_id}" match the same requests.
        normalized = _ROUTE_PARAMETER.sub("{}", prefix + path)
        methods = route.methods or {"*"}
        keys.update((method, normalized) for method in methods)
    return keys


def check_route_collisions(
    core_routes: Sequence[BaseRoute],
    plugin_routers: Iterable[tuple[str, APIRouter]],
    *,
    prefix: str,
) -> None:
    """Refuse a plugin route whose method and path Core or another plugin already serves."""
    taken = _route_keys(core_routes)
    for name, router in plugin_routers:
        for method, path in sorted(_route_keys(router.routes, prefix)):
            if (method, path) in taken or ("*", path) in taken:
                raise PluginLoadError(
                    f"Plugin {name!r} route {method} {path} collides with an existing route."
                )
            taken.add((method, path))


_lock = threading.Lock()
_loaded: LoadedPlugins | None = None


def loaded_plugins() -> LoadedPlugins:
    """Resolve the plugins named in ``EIMIR_PLUGINS`` once per process and log the result."""
    global _loaded
    with _lock:
        if _loaded is None:
            core_revision = build_revision()
            _loaded = resolve_plugins(
                parse_plugin_names(PluginSettings().plugins),
                installed_candidates(),
                core_revision=core_revision,
            )
            _log_loaded(_loaded, core_revision)
        return _loaded


def _log_loaded(loaded: LoadedPlugins, core_revision: str) -> None:
    capabilities = sorted(loaded.capabilities())
    log.info(
        "Plugins loaded: %s (seam version %d, revision %s, capabilities: %s).",
        ", ".join(loaded.names) or "none, Core only",
        PLUGIN_SEAM_VERSION,
        core_revision,
        ", ".join(capabilities) or "none",
        extra={
            "plugins": list(loaded.names),
            "seam_version": PLUGIN_SEAM_VERSION,
            "core_revision": core_revision,
            "capabilities": capabilities,
        },
    )
