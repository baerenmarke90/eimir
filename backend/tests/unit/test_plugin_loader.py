"""The plugin loader refuses every unsafe start (Decision 0017, acceptance criteria 5 and 7)."""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.routing import iter_route_contexts

from eimir.deployment.revision import UNVERIFIED_REVISION
from eimir.engagement.models import EngagementTarget
from eimir.entitlements.models import Capability
from eimir.jobs import runner
from eimir.jobs.worker import JobRegistry
from eimir.plugins import loader
from eimir.plugins.contract import PLUGIN_SEAM_VERSION, ProPlugin
from eimir.plugins.loader import (
    LoadedPlugins,
    PluginCandidate,
    PluginLoadError,
    check_route_collisions,
    installed_candidates,
    parse_plugin_names,
    resolve_plugins,
)
from tests.support.plugins import pro_plugin_object, require_pro_distribution

REVISION = "0123456789abcdef"


@dataclass
class FakePlugin:
    name: str = "pro"
    seam_version: int = PLUGIN_SEAM_VERSION
    core_revision: str = REVISION
    provided: frozenset[str] = frozenset({Capability.GAMES_COUPLE.value})
    modules: tuple[str, ...] = ()
    plugin_routers: tuple[APIRouter, ...] = field(default=())
    job_kinds: tuple[str, ...] = ()
    targets: Mapping[EngagementTarget, Any] = field(default_factory=dict)
    read_rules: Mapping[str, Callable[..., bool]] = field(default_factory=dict)
    hidden_wishes: frozenset[UUID] = frozenset()
    refused_setting: str | None = None

    def capabilities(self) -> frozenset[str]:
        return self.provided

    def model_modules(self) -> Sequence[str]:
        return self.modules

    def routers(self) -> Sequence[APIRouter]:
        return self.plugin_routers

    def register_jobs(self, registry: JobRegistry) -> None:
        for kind in self.job_kinds:
            registry.register(kind, lambda session, payload: None)

    def ensure_scheduled(self, session: object) -> None:
        return None

    def prune_expired(self, session: object) -> None:
        return None

    def on_outbox_event(self, session: object, event: object, event_type: object) -> None:
        return None

    def project_notification(self, *args: object) -> bool:
        return False

    def engagement_targets(self) -> Mapping[EngagementTarget, Any]:
        return self.targets

    def attachment_read_rules(self) -> Mapping[str, Callable[..., bool]]:
        return self.read_rules

    def push_preview_detail(self, *args: object) -> None:
        return None

    def on_partner_joined(self, *args: object) -> None:
        return None

    def on_membership_ended(self, *args: object) -> None:
        return None

    def on_member_left(self, *args: object) -> None:
        return None

    def on_account_deleted(self, *args: object) -> None:
        return None

    def export_account_document(self, *args: object) -> Mapping[str, Any]:
        return {}

    def hidden_wish_ids(self, session: object, context: object) -> frozenset[UUID]:
        return self.hidden_wishes

    def date_ideas(self) -> None:
        return None

    def migrations(self) -> None:
        return None

    def validate(self, settings: object) -> None:
        if self.refused_setting is not None:
            raise ValueError(self.refused_setting)

    def seed_demo(self, *args: object, **kwargs: object) -> None:
        return None


def candidate(
    plugin: object, *, name: str = "pro", distribution: str | None = "eimir-pro"
) -> PluginCandidate:
    return PluginCandidate(name=name, distribution=distribution, load=lambda: plugin)


def resolve(
    names: Sequence[str],
    candidates: Sequence[PluginCandidate],
    revision: str = REVISION,
) -> LoadedPlugins:
    return resolve_plugins(names, candidates, core_revision=revision)


def test_a_named_plugin_is_loaded_with_its_capabilities() -> None:
    plugin = FakePlugin()

    loaded = resolve(["pro"], [candidate(plugin)])

    assert loaded.plugins == (plugin,)
    assert loaded.capabilities() == {Capability.GAMES_COUPLE.value}


def test_an_empty_allow_list_runs_core_only() -> None:
    assert parse_plugin_names(" , ") == ()
    assert resolve([], []).plugins == ()


def test_hidden_wishes_come_only_from_loaded_plugins() -> None:
    # #2158 H: Core masks what a plugin's open game hides, and nothing without one.
    hidden = frozenset({uuid4()})
    loaded = resolve(["pro"], [candidate(FakePlugin(hidden_wishes=hidden))])

    assert loaded.hidden_wish_ids(object(), object()) == hidden  # type: ignore[arg-type]
    assert LoadedPlugins(()).hidden_wish_ids(object(), object()) == frozenset()  # type: ignore[arg-type]


def test_two_plugins_load_in_named_order() -> None:
    pro = FakePlugin()
    admin = FakePlugin(name="admin", provided=frozenset({Capability.SUPPORT_OPERATOR.value}))

    loaded = resolve(
        ["pro", "admin"],
        [
            candidate(admin, name="admin", distribution="eimir-admin"),
            candidate(pro),
        ],
    )

    assert loaded.names == ("pro", "admin")
    assert loaded.capabilities() == {
        Capability.GAMES_COUPLE.value,
        Capability.SUPPORT_OPERATOR.value,
    }


def test_overlapping_capabilities_refuse_to_start() -> None:
    pro = FakePlugin()
    admin = FakePlugin(name="admin", provided=frozenset({Capability.GAMES_COUPLE.value}))

    with pytest.raises(PluginLoadError) as error:
        resolve(
            ["pro", "admin"],
            [candidate(pro), candidate(admin, name="admin", distribution="eimir-admin")],
        )

    message = str(error.value)
    assert "'pro'" in message
    assert "'admin'" in message
    assert Capability.GAMES_COUPLE.value in message


def test_admin_name_only_from_eimir_admin_distribution() -> None:
    admin = FakePlugin(name="admin", provided=frozenset({Capability.SUPPORT_OPERATOR.value}))

    with pytest.raises(PluginLoadError, match="expected 'eimir-admin'"):
        resolve(["admin"], [candidate(admin, name="admin", distribution="eimir-pro")])
    normalized = resolve(["admin"], [candidate(admin, name="admin", distribution="eimir_admin")])
    assert normalized.names == ("admin",)


def test_a_named_but_missing_plugin_refuses_to_start() -> None:
    with pytest.raises(PluginLoadError, match="not installed"):
        resolve(["pro"], [])


def test_a_seam_version_mismatch_refuses_to_start() -> None:
    plugin = FakePlugin(seam_version=PLUGIN_SEAM_VERSION + 1)

    with pytest.raises(PluginLoadError, match="seam version"):
        resolve(["pro"], [candidate(plugin)])


def test_a_core_revision_mismatch_refuses_to_start() -> None:
    plugin = FakePlugin(core_revision="fedcba9876543210")

    with pytest.raises(PluginLoadError, match="Core revision"):
        resolve(["pro"], [candidate(plugin)])


def test_a_local_checkout_checks_the_seam_version_only() -> None:
    plugin = FakePlugin(core_revision="fedcba9876543210")

    assert resolve(["pro"], [candidate(plugin)], UNVERIFIED_REVISION).plugins == (plugin,)


def test_an_installed_but_unnamed_plugin_is_ignored(caplog: pytest.LogCaptureFixture) -> None:
    def never_load() -> object:
        raise AssertionError("an unnamed plugin must not be imported")

    caplog.set_level(logging.INFO, logger=loader.__name__)

    loaded = resolve([], [PluginCandidate("pro", "eimir-pro", never_load)])

    assert loaded.plugins == ()
    assert "'pro' is not named in EIMIR_PLUGINS" in caplog.text


def test_a_foreign_distribution_cannot_claim_the_plugin_name() -> None:
    with pytest.raises(PluginLoadError, match="expected 'eimir-pro'"):
        resolve(["pro"], [candidate(FakePlugin(), distribution="someone-elses-pro")])


def test_a_plugin_name_provided_twice_refuses_to_start() -> None:
    with pytest.raises(PluginLoadError, match="more than once"):
        resolve(["pro"], [candidate(FakePlugin()), candidate(FakePlugin())])


def test_a_plugin_named_twice_in_the_setting_refuses_to_start() -> None:
    with pytest.raises(PluginLoadError, match="more than once"):
        parse_plugin_names("pro, pro")


def test_an_unknown_plugin_name_refuses_to_start() -> None:
    with pytest.raises(PluginLoadError, match="unknown plugin"):
        resolve(["extra"], [candidate(FakePlugin(name="extra"), name="extra")])


def test_a_plugin_that_fails_to_import_refuses_to_start() -> None:
    def broken() -> object:
        raise ImportError("missing module")

    with pytest.raises(PluginLoadError, match="failed to import"):
        resolve(["pro"], [PluginCandidate("pro", "eimir-pro", broken)])


def test_an_object_without_the_contract_refuses_to_start() -> None:
    with pytest.raises(PluginLoadError, match="contract"):
        resolve(["pro"], [candidate(object())])


def test_a_plugin_under_another_name_refuses_to_start() -> None:
    with pytest.raises(PluginLoadError, match="named 'other'"):
        resolve(["pro"], [candidate(FakePlugin(name="other"))])


def test_an_unknown_capability_refuses_to_start() -> None:
    plugin = FakePlugin(provided=frozenset({"games.unlimited"}))

    with pytest.raises(PluginLoadError, match="unknown capabilities"):
        resolve(["pro"], [candidate(plugin)])


def test_a_model_module_that_fails_to_import_refuses_to_start() -> None:
    plugin = FakePlugin(modules=("eimir.does_not_exist.models",))

    with pytest.raises(PluginLoadError, match="model module"):
        resolve(["pro"], [candidate(plugin)])


def _router(path: str, *, prefix: str = "") -> APIRouter:
    router = APIRouter(prefix=prefix)

    @router.get(path)
    def endpoint() -> None:
        return None

    return router


def test_a_plugin_route_that_collides_with_core_refuses_to_start() -> None:
    core = FastAPI()
    core.include_router(_router("/spaces/{space_id}/garden"), prefix="/api/v1")

    with pytest.raises(PluginLoadError, match=r"GET /api/v1/spaces/\{\}/garden"):
        check_route_collisions(
            core.routes, [("pro", _router("/spaces/{id}/garden"))], prefix="/api/v1"
        )


def test_two_plugin_routes_that_collide_refuse_to_start() -> None:
    with pytest.raises(PluginLoadError, match="collides"):
        check_route_collisions(
            FastAPI().routes,
            [("pro", _router("/a", prefix="/x")), ("pro", _router("/x/a"))],
            prefix="/api/v1",
        )


def test_distinct_plugin_routes_are_accepted() -> None:
    core = FastAPI()
    core.include_router(_router("/spaces/{space_id}/memories"), prefix="/api/v1")

    check_route_collisions(core.routes, [("pro", _router("/spaces/{id}/garden"))], prefix="/api/v1")


def test_the_pro_plugin_is_registered_as_entry_point_of_its_distribution() -> None:
    require_pro_distribution()
    candidates = [entry for entry in installed_candidates() if entry.name == "pro"]
    assert [entry.distribution for entry in candidates] == ["eimir-pro"]
    loaded = resolve(["pro"], candidates, UNVERIFIED_REVISION)
    assert loaded.plugins == (pro_plugin_object(),)
    assert isinstance(pro_plugin_object(), ProPlugin)


def test_the_in_tree_pro_plugin_provides_the_moving_capabilities() -> None:
    assert pro_plugin_object().capabilities() == {
        Capability.GAMES_COUPLE.value,
        Capability.INTEGRATION_EXTERNAL_SYNC.value,
        Capability.MEDIA_VIDEO_UPLOAD.value,
        Capability.MEMORIES_MAP.value,
        Capability.PARTNER_ONCE_MESSAGES.value,
        Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value,
        Capability.PRESENCE_LOCATION.value,
        Capability.RELATIONSHIP_PASSPORT.value,
        Capability.THEME_BESPOKE_PACKS.value,
        Capability.DAILY_QUOTE.value,
        Capability.PLANNING_DATE_INSPIRATION.value,
    }


def test_the_in_tree_pro_plugin_is_built_against_this_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EIMIR_BUILD_REVISION", REVISION)

    assert pro_plugin_object().core_revision == REVISION
    assert resolve(["pro"], [candidate(pro_plugin_object())]).plugins == (pro_plugin_object(),)


def test_startup_names_plugins_seam_revision_and_capabilities(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(loader, "_loaded", None)
    monkeypatch.setenv("EIMIR_PLUGINS", "pro")
    monkeypatch.setenv("EIMIR_BUILD_REVISION", REVISION)
    monkeypatch.setattr(loader, "installed_candidates", lambda: [candidate(FakePlugin())])
    caplog.set_level(logging.INFO, logger=loader.__name__)

    loaded = loader.loaded_plugins()

    assert loader.loaded_plugins() is loaded
    [record] = [record for record in caplog.records if record.getMessage().startswith("Plugins")]
    assert record.getMessage() == (
        f"Plugins loaded: pro (seam version {PLUGIN_SEAM_VERSION}, revision {REVISION}, "
        "capabilities: games.couple)."
    )
    assert record.plugins == ["pro"]
    assert record.seam_version == PLUGIN_SEAM_VERSION
    assert record.core_revision == REVISION
    assert record.capabilities == ["games.couple"]


def test_core_only_startup_says_so(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(loader, "_loaded", None)
    monkeypatch.setenv("EIMIR_PLUGINS", "")
    caplog.set_level(logging.INFO, logger=loader.__name__)

    assert loader.loaded_plugins().plugins == ()
    assert "Plugins loaded: none, Core only" in caplog.text


def _refuse() -> LoadedPlugins:
    raise PluginLoadError("refused")


def test_the_api_refuses_to_start_without_its_named_plugin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from eimir import main

    monkeypatch.setattr(main, "loaded_plugins", _refuse)

    with pytest.raises(PluginLoadError, match="refused"):
        main.create_app()


def test_the_api_refuses_a_plugin_route_that_collides_with_core(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from eimir import main

    plugin = FakePlugin(plugin_routers=(_router("/health"),))
    monkeypatch.setattr(main, "loaded_plugins", lambda: LoadedPlugins((plugin,)))

    with pytest.raises(PluginLoadError, match="GET /api/v1/health"):
        main.create_app()


def test_the_api_mounts_plugin_routes_behind_normal_operation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from eimir import main
    from eimir.api.deps import require_normal_operation

    plugin = FakePlugin(plugin_routers=(_router("/plugin-probe"),))
    monkeypatch.setattr(main, "loaded_plugins", lambda: LoadedPlugins((plugin,)))

    app = main.create_app()

    [route] = [
        route for route in iter_route_contexts(app.routes) if route.path == "/api/v1/plugin-probe"
    ]
    assert require_normal_operation in [dependency.dependency for dependency in route.dependencies]


def test_the_worker_refuses_to_start_without_its_named_plugin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(runner, "configure_logging", lambda settings: None)
    monkeypatch.setattr(runner, "loaded_plugins", _refuse)

    with pytest.raises(PluginLoadError, match="refused"):
        runner.main()


def test_a_plugin_target_the_manifest_does_not_declare_refuses_to_start() -> None:
    plugin = FakePlugin(targets={EngagementTarget.MEMORY: lambda *args: None})

    with pytest.raises(PluginLoadError, match="notification targets"):
        resolve(["pro"], [candidate(plugin)])


def test_a_plugin_attachment_parent_the_manifest_does_not_declare_refuses_to_start() -> None:
    plugin = FakePlugin(read_rules={"MEMORY": lambda *args: True})

    with pytest.raises(PluginLoadError, match="attachment parents"):
        resolve(["pro"], [candidate(plugin)])


def test_a_plugin_job_kind_the_manifest_does_not_declare_refuses_to_start() -> None:
    loaded = resolve(["pro"], [candidate(FakePlugin(job_kinds=("pro.unknown_job",)))])

    with pytest.raises(PluginLoadError, match="job kinds"):
        loaded.register_jobs(JobRegistry())


def test_a_worker_without_the_plugin_leaves_its_job_kinds_unclaimed() -> None:
    from eimir.plugins.manifest import PLUGIN_JOB_KINDS

    registry = JobRegistry()
    LoadedPlugins(()).register_jobs(registry)
    assert LoadedPlugins(()).unclaimed_job_kinds(registry) == PLUGIN_JOB_KINDS

    pro_plugin_object().register_jobs(registry)
    assert registry.kinds() == PLUGIN_JOB_KINDS
    assert LoadedPlugins((pro_plugin_object(),)).unclaimed_job_kinds(registry) == frozenset()


def test_the_in_tree_pro_plugin_decides_exactly_the_declared_targets_and_parents() -> None:
    from eimir.plugins.manifest import PLUGIN_ENGAGEMENT_TARGETS, attachment_rules

    assert set(pro_plugin_object().engagement_targets()) == PLUGIN_ENGAGEMENT_TARGETS
    assert set(pro_plugin_object().attachment_read_rules()) == {
        rule.parent_type for _, rule in attachment_rules()
    }


def test_a_plugin_that_refuses_its_configuration_refuses_to_start() -> None:
    loaded = resolve(["pro"], [candidate(FakePlugin(refused_setting="missing key"))])

    with pytest.raises(PluginLoadError, match="'pro' refused its configuration: missing key"):
        loaded.validate(object())  # type: ignore[arg-type]


def test_the_api_refuses_to_start_when_a_plugin_refuses_its_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from eimir import main

    plugin = FakePlugin(refused_setting="missing key")
    monkeypatch.setattr(main, "loaded_plugins", lambda: LoadedPlugins((plugin,)))

    with pytest.raises(PluginLoadError, match="missing key"):
        main.create_app()


def test_the_worker_refuses_to_start_when_a_plugin_refuses_its_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = FakePlugin(refused_setting="missing key")
    monkeypatch.setattr(runner, "configure_logging", lambda settings: None)
    monkeypatch.setattr(runner, "loaded_plugins", lambda: LoadedPlugins((plugin,)))

    with pytest.raises(PluginLoadError, match="missing key"):
        runner.main()


def test_the_in_tree_pro_plugin_has_no_chain_and_accepts_the_settings() -> None:
    # The existing Pro tables stay in the Core chain (Decision 0017, decision 6).
    from eimir.config import get_settings

    assert pro_plugin_object().migrations() is None
    pro_plugin_object().validate(get_settings())
