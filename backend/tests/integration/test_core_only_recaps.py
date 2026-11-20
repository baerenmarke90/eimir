"""Recaps on an instance without the Pro plugin (Decision 0017, #2084).

`relationship.passport` is plugin-owned, so a Core-only instance behaves like
an expired Pro for recaps: what was composed while the plugin was loaded stays
readable and exportable and the members' own words stay theirs, while new
composition pauses. These tests are not Pro feature tests: the Core-only CI job
runs them with ``EIMIR_PLUGINS=""``; the plugin-loaded job runs them against a
simulated absent plugin.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core import clock
from eimir.core.errors import PremiumEntitlementRequiredError
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.memories.models import Memory, MemoryPayload
from eimir.recaps import jobs, service
from eimir.recaps.models import RecapEdition, RecapKind
from eimir.relationship import service as relationship_service
from eimir.transfer import service as transfer_service
from eimir.transfer.models import TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import plugins_loaded, with_pro_plugin, without_plugins

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)


@contextmanager
def core_only() -> Iterator[None]:
    """Run Core-only: for real in the Core-only job, simulated in the plugin-loaded one."""
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


@pytest.fixture
def couple(session: Session, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    monkeypatch.setattr(clock, "now", lambda: NOW)
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    # The Pro grant is still current: only the plugin is missing.
    entitlements.record_grant(
        session,
        space_id=space.id,
        account_id=anna.id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=NOW - timedelta(days=30),
        effective_until=NOW + timedelta(days=30),
        capabilities=["relationship.passport"],
    )
    session.add(
        Memory(
            space_id=space.id,
            owner_id=anna.id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            happened_on=date(2026, 10, 21),
            payload=MemoryPayload(title="A recorded experience", body="Our shared words"),
        )
    )
    session.flush()
    return SimpleNamespace(
        anna=anna,
        space=space,
        headers=auth(sign_in(session, anna)),
        partner=auth(sign_in(session, ben)),
        path=f"/api/v1/spaces/{space.id}/recaps",
    )


def _compose(session: Session, couple: SimpleNamespace, month: int) -> str:
    # Through the service: the request route is plugin code, so it is not mounted
    # in the Core-only configuration (its absence is covered by test_pro_routes.py).
    context = AuthorizationContext(account_id=couple.anna.id, space_id=couple.space.id)
    value = service.request_period(session, context, RecapKind.MONTH, 2026, month)
    session.flush()
    return str(value.id)


def _generate(session: Session, couple: SimpleNamespace, recap_id: str) -> None:
    record = session.get(RecapEdition, UUID(recap_id))
    assert record is not None
    jobs.generate(
        session,
        {
            "space_id": str(couple.space.id),
            "account_id": str(couple.anna.id),
            "edition_id": recap_id,
            "request_token": str(record.request_token),
        },
    )
    session.flush()


def test_without_the_plugin_recaps_stay_readable_exportable_and_composition_pauses(
    client: TestClient, session: Session, couple: SimpleNamespace
) -> None:
    # Composed while the plugin was loaded: one ready recap with shared words,
    # one requested whose composition job has not run yet.
    with with_pro_plugin():
        recap_id = _compose(session, couple, 10)
        _generate(session, couple, recap_id)
        words = client.put(
            f"{couple.path}/{recap_id}/reflection",
            headers=couple.headers,
            json={"text": "Words we keep", "shared": True, "version": 0},
        )
        assert words.status_code == 200
        pending_id = _compose(session, couple, 9)
    editions = session.scalar(
        select(func.count())
        .select_from(RecapEdition)
        .where(RecapEdition.space_id == couple.space.id)
    )

    with core_only():
        overview = client.get(couple.path, headers=couple.headers)
        assert overview.status_code == 200
        assert overview.json()["canCompose"] is False

        # Stored recaps and shared words stay readable for both members.
        for headers in (couple.headers, couple.partner):
            stored = client.get(f"{couple.path}/{recap_id}", headers=headers)
            assert stored.status_code == 200
            assert stored.json()["status"] == "READY"
            assert [item["text"] for item in stored.json()["reflections"]] == ["Words we keep"]

        # ...and exportable.
        anna = AuthorizationContext(account_id=couple.anna.id, space_id=couple.space.id)
        with (
            transfer_service.build_export_archive(session, anna, TransferScope.PERSONAL) as bundle,
            ZipFile(bundle) as archive,
        ):
            exported = archive.read("recaps.json")
        assert json.loads(exported)["tables"]
        assert recap_id.encode() in exported and b"Words we keep" in exported

        # New composition pauses: no new period, and the queued job does not compose.
        with pytest.raises(PremiumEntitlementRequiredError):
            _compose(session, couple, 8)
        _generate(session, couple, pending_id)
        paused = session.get(RecapEdition, UUID(pending_id))
        assert paused is not None and paused.status == "PAUSED"
        jobs.scan(session, {})
        session.flush()
        assert (
            session.scalar(
                select(func.count())
                .select_from(RecapEdition)
                .where(RecapEdition.space_id == couple.space.id)
            )
            == editions
        )

        # The member's own words stay theirs: editable and withdrawable.
        own = client.get(f"{couple.path}/{recap_id}", headers=couple.headers).json()["reflections"][
            0
        ]
        edited = client.put(
            f"{couple.path}/{recap_id}/reflection",
            headers=couple.headers,
            json={"text": "Words we still keep", "shared": True, "version": own["version"]},
        )
        assert edited.status_code == 200
        version = edited.json()["reflections"][0]["version"]
        withdrawn = client.delete(
            f"{couple.path}/{recap_id}/reflection",
            headers={**couple.headers, "If-Match": str(version)},
        )
        assert withdrawn.status_code == 204
        assert (
            client.get(f"{couple.path}/{recap_id}", headers=couple.partner).json()["reflections"]
            == []
        )
