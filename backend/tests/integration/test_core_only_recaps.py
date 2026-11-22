"""Recaps on an instance without the Pro plugin (Decision 0017, #2084).

`relationship.passport` is plugin-owned, so a Core-only instance behaves like
an expired Pro for recaps: what was composed while the plugin was loaded stays
readable and exportable and the members' own words stay theirs, while new
composition pauses: the composing routes are not mounted and no worker without
the plugin claims a queued recap job. The data of the plugin-loaded past is
created through plugin code, imported where it is used. These tests are not Pro
feature tests: the Core-only CI job runs them with ``EIMIR_PLUGINS=""``; the
plugin-loaded job runs them against a simulated absent plugin.
"""

from __future__ import annotations

import io
import json
from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core import clock
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.models import Account
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry
from eimir.memories.models import Memory, MemoryPayload
from eimir.plugins.loader import loaded_plugins
from eimir.plugins.manifest import PLUGIN_JOB_KINDS
from eimir.recaps.models import RecapEdition, RecapKind, RecapReflection, RecapSource
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from eimir.transfer import service as transfer_service
from eimir.transfer.models import TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import plugins_loaded, with_pro_plugin, without_plugins

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)
RECAP_JOB_KINDS = frozenset(
    {
        "recap.announce.v1",
        "recap.backfill.v1",
        "recap.generate.v1",
        "recap.refresh.v1",
        "recap.scan.v1",
    }
)


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
    from eimir_pro.recap_composition import composer

    context = AuthorizationContext(account_id=couple.anna.id, space_id=couple.space.id)
    value = composer.request_period(session, context, RecapKind.MONTH, 2026, month)
    session.flush()
    return str(value.id)


def _generate(session: Session, couple: SimpleNamespace, recap_id: str) -> None:
    from eimir_pro.recap_composition import jobs

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

        # New composition pauses: a worker without the plugin claims no recap job,
        # so the queued composition stays pending (never failed) for a worker that
        # loads the plugin, and no scan prepares new periods.
        registry = JobRegistry()
        loaded_plugins().register_jobs(registry)
        assert RECAP_JOB_KINDS <= PLUGIN_JOB_KINDS
        assert loaded_plugins().unclaimed_job_kinds(registry) >= RECAP_JOB_KINDS
        queued = session.scalar(
            select(Job).where(
                Job.kind == "recap.generate.v1", Job.payload["edition_id"].astext == pending_id
            )
        )
        assert queued is not None and queued.status == JobStatus.PENDING.value
        waiting = session.get(RecapEdition, UUID(pending_id))
        assert waiting is not None and waiting.status == "PENDING"
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


def _transfer(session: Session, source: AuthorizationContext, target: AuthorizationContext) -> None:
    from eimir.transfer import jobs as transfer_jobs
    from eimir.transfer.models import ImportStatus

    with transfer_service.build_export_archive(session, source, TransferScope.PERSONAL) as bundle:
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        transfer = transfer_service.create_import(session, target, bundle, size=size)
    transfer_jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    transfer_service.request_apply(session, target, str(transfer.id))
    transfer_jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED.value


def test_without_the_plugin_recaps_restore_and_follow_source_and_account_deletion(
    client: TestClient, session: Session, couple: SimpleNamespace
) -> None:
    anna = AuthorizationContext(account_id=couple.anna.id, space_id=couple.space.id)
    with with_pro_plugin():
        recap_id = _compose(session, couple, 10)
        _generate(session, couple, recap_id)
        for text, shared in (("Words we keep", True), ("Anna private draft", False)):
            reflection = client.put(
                f"{couple.path}/{recap_id}/reflection",
                headers=couple.headers,
                json={"text": text, "shared": shared, "version": 0},
            )
            assert reflection.status_code == 200
    ben = session.scalar(
        select(Membership.account_id).where(
            Membership.space_id == couple.space.id, Membership.account_id != couple.anna.id
        )
    )
    assert ben is not None

    with core_only():
        # Restore: the bundle brings the edition and its words into another Space.
        target = make_space(session, couple.anna)
        relationship_service.add_member(session, target.id, session.get(Account, ben))
        restored_context = AuthorizationContext(account_id=couple.anna.id, space_id=target.id)
        _transfer(session, anna, restored_context)
        restored = session.scalar(select(RecapEdition).where(RecapEdition.space_id == target.id))
        assert restored is not None
        reread = client.get(
            f"/api/v1/spaces/{target.id}/recaps/{restored.id}", headers=couple.headers
        )
        assert reread.status_code == 200
        assert [item["text"] for item in reread.json()["reflections"]] == ["Words we keep"]
        assert reread.json()["ownDraft"]["text"] == "Anna private draft"

        # The source still governs the stored edition: a deleted source becomes
        # unavailable and its words leave the edition.
        source = session.scalar(select(Memory).where(Memory.space_id == couple.space.id))
        assert source is not None
        session.delete(source)
        session.flush()
        withdrawn = client.get(f"{couple.path}/{recap_id}", headers=couple.partner).json()
        assert [item["available"] for item in withdrawn["sources"]] == [False]
        assert "Our shared words" not in json.dumps(withdrawn)

        # Account deletion removes the member's private draft; the shared
        # edition stays readable for the partner.
        apply_accepted_tombstone(session, couple.anna.id, accepted_at=NOW)
        apply_core_cleanup(session, couple.anna.id)
        session.flush()
        drafts = session.scalars(
            select(RecapReflection).where(
                RecapReflection.owner_id == couple.anna.id,
                RecapReflection.privacy_class == PrivacyClass.OWNER_ONLY.value,
            )
        ).all()
        assert drafts == []
        kept = client.get(f"{couple.path}/{recap_id}", headers=couple.partner)
        assert kept.status_code == 200
        assert kept.json()["status"] == "READY"


def test_a_recap_continues_unchanged_when_the_plugin_returns(
    client: TestClient, session: Session, couple: SimpleNamespace
) -> None:
    with with_pro_plugin():
        recap_id = _compose(session, couple, 10)
        _generate(session, couple, recap_id)
        pending_id = _compose(session, couple, 9)
        before = client.get(f"{couple.path}/{recap_id}", headers=couple.headers).json()

    with core_only():
        assert client.get(f"{couple.path}/{recap_id}", headers=couple.headers).json() == before
        assert session.get(RecapEdition, UUID(pending_id)).status == "PENDING"  # type: ignore[union-attr]

    # The plugin is back: the queued composition runs with the same payload and
    # the edition composed before the outage is unchanged.
    with with_pro_plugin():
        registry = JobRegistry()
        loaded_plugins().register_jobs(registry)
        assert loaded_plugins().unclaimed_job_kinds(registry).isdisjoint(RECAP_JOB_KINDS)
        queued = session.scalar(
            select(Job).where(
                Job.kind == "recap.generate.v1", Job.payload["edition_id"].astext == pending_id
            )
        )
        assert queued is not None and queued.status == JobStatus.PENDING.value
        handler = registry.get("recap.generate.v1")
        assert handler is not None
        handler(session, dict(queued.payload))
        session.flush()
        resumed = session.get(RecapEdition, UUID(pending_id))
        assert resumed is not None and resumed.status in {"READY", "EMPTY"}
        assert client.get(f"{couple.path}/{recap_id}", headers=couple.headers).json() == before
        assert client.get(couple.path, headers=couple.headers).json()["canCompose"] is True


def test_without_the_plugin_space_retention_purges_its_recaps(
    client: TestClient,
    session: Session,
    couple: SimpleNamespace,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from eimir.media.local import LocalMediaStore
    from eimir.relationship import policy, retention

    with with_pro_plugin():
        recap_id = _compose(session, couple, 10)
        _generate(session, couple, recap_id)
        words = client.put(
            f"{couple.path}/{recap_id}/reflection",
            headers=couple.headers,
            json={"text": "Words we keep", "shared": True, "version": 0},
        )
        assert words.status_code == 200

    with core_only():
        # Both members left long enough ago: the final whole-Space purge also
        # removes the recap editions, their sources and the reflections.
        ended_at = NOW - policy.SPACE_OFFBOARDING_RETENTION - timedelta(days=1)
        for membership in session.scalars(
            select(Membership).where(Membership.space_id == couple.space.id)
        ):
            membership.status = MembershipStatus.LEFT.value
            membership.ended_at = ended_at
        couple.space.offboarding_purge_at = policy.purge_eligible_at(ended_at)
        session.flush()
        monkeypatch.setattr(retention, "get_media_store", lambda: LocalMediaStore(tmp_path))

        purged, _, _ = retention.purge_due_spaces(session, current_time=NOW)
        session.flush()

        assert purged == 1
        edition = UUID(recap_id)
        assert session.get(RecapEdition, edition) is None
        for model in (RecapSource, RecapReflection):
            count = select(func.count()).select_from(model).where(model.edition_id == edition)
            assert session.scalar(count) == 0
