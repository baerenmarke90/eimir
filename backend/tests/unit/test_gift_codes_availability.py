"""Public availability flag for gift code redemption (part 5, #2328).

The couple client shows its redeem entry only where the redeem route exists:
eimir. Cloud with a loaded plugin that provides the gift code capability. The
flag must match ``server_admin.pro_area_available`` exactly.
"""

from __future__ import annotations

import pytest

from eimir import config
from eimir.administration import service as administration
from eimir.api.v1 import instance
from eimir.auth.policy import resolve_auth_capabilities
from eimir.config import Deployment
from eimir.plugins import loader


class _StubPlugin:
    name = "stub"

    def __init__(self, capabilities: list[str]) -> None:
        self._capabilities = frozenset(capabilities)

    def capabilities(self) -> frozenset[str]:
        return self._capabilities


@pytest.mark.parametrize(
    ("deployment", "provided", "expected"),
    [
        ("cloud", ["gift_codes.operator"], True),
        ("self_hosted", ["gift_codes.operator"], False),
        ("cloud", [], False),
    ],
)
def test_instance_status_reports_gift_code_availability(
    monkeypatch: pytest.MonkeyPatch, deployment: str, provided: list[str], expected: bool
) -> None:
    settings = config.get_settings().model_copy(update={"deployment": Deployment(deployment)})
    monkeypatch.setattr(config, "get_settings", lambda: settings)
    monkeypatch.setattr(
        loader,
        "_loaded",
        loader.LoadedPlugins((_StubPlugin(provided),)),  # type: ignore[arg-type]
    )
    state = administration.InstanceAccessState(registration_enabled=True, maintenance_mode=False)
    # The access state is stored in the database; this test only needs the flag.
    monkeypatch.setattr(administration, "get_access_state", lambda _session: state)

    status = instance.instance_status(
        session=None,  # type: ignore[arg-type]
        auth_policy=resolve_auth_capabilities(),
    )

    assert status.model_dump(by_alias=True)["giftCodesAvailable"] is expected


def test_flag_defaults_to_false() -> None:
    assert (
        instance.InstanceAccessStatus(
            maintenance_mode=False,
            registration_available=True,
            registration_unavailable_reason=None,
        ).gift_codes_available
        is False
    )
