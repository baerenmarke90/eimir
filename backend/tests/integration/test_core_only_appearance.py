"""Paid appearance choices on an instance without the Pro plugin (Decision 0017, #2084).

`theme.bespoke_packs` is plugin-owned while the four value checks stay Core.
Without the plugin a Pro value is refused even under a current Premium grant,
the Free values keep working, and a Pro value chosen while the plugin was loaded
stays in effect and readable. These tests are not Pro feature tests: the
Core-only CI job runs them with ``EIMIR_PLUGINS=""``; the plugin-loaded job runs
them against a simulated absent plugin.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.relationship.service import add_member
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import plugins_loaded, with_pro_plugin, without_plugins

pytestmark = [pytest.mark.integration, requires_database]

# (path suffix, body field, a Pro value, another Pro value, a Free value)
CHOICES = [
    ("app-icon", "iconId", "sage", "sand", "original"),
    ("wir-design", "designId", "modern", "classic", "warm"),
    ("person-colours", "colours", "blue_deepblue", "rose_blue", None),
    # Stage 1 of #2283 has a single Pro world, so the second Pro value repeats it:
    # re-saving a stored Pro world is a new Pro choice and is refused as well.
    ("memory-world", "worldId", "crate", "crate", "stack"),
]


@contextmanager
def core_only() -> Iterator[None]:
    """Run Core-only: for real in the Core-only job, simulated in the plugin-loaded one."""
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


@pytest.fixture
def couple(session: Session) -> SimpleNamespace:
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    # A current Premium grant with the capability: only the plugin is missing.
    entitlements.record_grant(
        session,
        space_id=space.id,
        account_id=anna.id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=clock.now() - timedelta(days=1),
        capabilities=["theme.bespoke_packs"],
    )
    session.flush()
    return SimpleNamespace(space=space, headers=auth(sign_in(session, anna)))


def _patch(client: TestClient, path: str, headers: dict[str, str], body: dict[str, object]):  # type: ignore[no-untyped-def]
    current = client.get(path, headers=headers)
    assert current.status_code == 200
    return client.patch(path, headers={**headers, "If-Match": current.headers["ETag"]}, json=body)


@pytest.mark.parametrize(("suffix", "field", "chosen", "other", "free"), CHOICES)
def test_without_the_plugin_pro_values_are_refused_free_values_work_and_stored_ones_stay(
    client: TestClient,
    session: Session,
    couple: SimpleNamespace,
    suffix: str,
    field: str,
    chosen: str,
    other: str,
    free: str | None,
) -> None:
    path = f"/api/v1/spaces/{couple.space.id}/appearance/{suffix}"
    with with_pro_plugin():
        saved = _patch(client, path, couple.headers, {field: chosen})
        assert saved.status_code == 200

    with core_only():
        # A choice made while the plugin was loaded stays in effect and readable.
        stored = client.get(path, headers=couple.headers)
        assert stored.status_code == 200
        assert stored.json()[field] == chosen

        # A new Pro value is refused despite the Premium grant.
        refused = _patch(client, path, couple.headers, {field: other})
        assert refused.status_code == 403
        assert refused.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
        assert client.get(path, headers=couple.headers).json()[field] == chosen

        # Going back to a Free value always works.
        reset = _patch(client, path, couple.headers, {field: free})
        assert reset.status_code == 200
        assert reset.json()[field] == free
