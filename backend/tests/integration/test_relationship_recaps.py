"""Real PostgreSQL boundaries for automatic recap artifacts and private drafts."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select

from eimir.authorization import PrivacyClass
from eimir.core import clock
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.jobs.models import Job
from eimir.memories.models import Memory, MemoryPayload
from eimir.recaps import jobs, service
from eimir.recaps.models import RecapEdition, RecapPayload
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 10, 30, 12, tzinfo=UTC)


@pytest.fixture
def context(session, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: NOW)
    anna, ben, other = (make_account(session, name) for name in ("Anna", "Ben", "Other"))
    space, foreign = make_space(session, anna), make_space(session, other)
    relationship_service.add_member(session, space.id, ben)
    grant = entitlements.record_grant(
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
    session.flush()
    return {
        "space": space,
        "foreign": foreign,
        "anna": anna,
        "ben": ben,
        "grant": grant,
        "headers": auth(sign_in(session, anna)),
        "partner": auth(sign_in(session, ben)),
        "path": f"/api/v1/spaces/{space.id}/recaps",
    }


def memory(session, context, *, day=date(2026, 10, 21), foreign=False):  # type: ignore[no-untyped-def]
    item = Memory(
        space_id=(context["foreign"] if foreign else context["space"]).id,
        owner_id=context["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=day,
        payload=MemoryPayload(
            title="A recorded experience", body="Only our authorized shared words"
        ),
    )
    session.add(item)
    session.flush()
    return item


def request(client, context, **extra):  # type: ignore[no-untyped-def]
    return client.post(
        context["path"],
        headers=context["headers"],
        json={"kind": "MONTH", "year": 2026, "month": 10, **extra},
    )


def generate(session, context, value):  # type: ignore[no-untyped-def]
    record = session.get(RecapEdition, UUID(value["id"]))
    jobs.generate(
        session,
        {
            "space_id": str(context["space"].id),
            "account_id": str(context["anna"].id),
            "edition_id": value["id"],
            "request_token": str(record.request_token),
        },
    )
    session.flush()


def read(client, context, value, *, partner=False):  # type: ignore[no-untyped-def]
    return client.get(
        f"{context['path']}/{value['id']}",
        headers=context["partner"] if partner else context["headers"],
    )


def test_period_preparation_is_idempotent_and_reopening_never_enqueues(client, session, context):  # type: ignore[no-untyped-def]
    memory(session, context)
    first, second = request(client, context), request(client, context)
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert (
        session.scalar(
            select(func.count()).select_from(Job).where(Job.kind == service.GENERATE_JOB)
        )
        == 1
    )
    generate(session, context, first.json())
    result = read(client, context, first.json())
    assert result.status_code == 200
    assert result.json()["status"] == "READY"
    assert result.json()["isPartial"] is True
    assert result.json()["throughOn"] == "2026-10-30"
    assert (
        read(client, context, first.json(), partner=True).json()["sources"]
        == result.json()["sources"]
    )
    assert (
        session.scalar(
            select(func.count()).select_from(Job).where(Job.kind == service.GENERATE_JOB)
        )
        == 1
    )


def test_shared_period_never_includes_owner_only_or_foreign_material(client, session, context):  # type: ignore[no-untyped-def]
    shared = memory(session, context)
    foreign = memory(session, context, foreign=True)
    private = HeartMoment(
        space_id=context["space"].id,
        owner_id=context["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=date(2026, 10, 20),
        payload=HeartMomentPayload(text="Secret private note", emotion=HeartEmotion.LOVED),
    )
    session.add(private)
    session.flush()
    proposed = request(client, context).json()
    generate(session, context, proposed)
    result = read(client, context, proposed).json()
    assert {source["id"] for source in result["sources"]} == {str(shared.id)}
    assert "Secret private note" not in str(result)
    selection = client.get(
        f"{context['path']}/{proposed['id']}/selection", headers=context["headers"]
    )
    assert {source["id"] for source in selection.json()["items"]} == {str(shared.id)}
    invalid = client.put(
        f"{context['path']}/{proposed['id']}/selection",
        headers={**context["headers"], "If-Match": str(result["version"])},
        json={"sourceKeys": [f"MEMORY:{foreign.id}"]},
    )
    assert invalid.status_code == 422


def test_drafts_are_owner_only_and_sharing_requires_a_separate_write(client, session, context):  # type: ignore[no-untyped-def]
    memory(session, context)
    proposed = request(client, context).json()
    generate(session, context, proposed)
    path = f"{context['path']}/{proposed['id']}/reflection"
    draft = client.put(
        path,
        headers=context["headers"],
        json={"text": "My private reflection", "shared": False, "version": 0},
    )
    assert draft.status_code == 200
    assert draft.json()["ownDraft"]["text"] == "My private reflection"
    partner = read(client, context, proposed, partner=True).json()
    assert partner["ownDraft"] is None and partner["reflections"] == []
    shared = client.put(
        path,
        headers=context["headers"],
        json={"text": "Words deliberately shared", "shared": True, "version": 0},
    )
    assert shared.status_code == 200
    assert (
        read(client, context, proposed, partner=True).json()["reflections"][0]["text"]
        == "Words deliberately shared"
    )
    own_version = shared.json()["reflections"][0]["version"]
    withdrawal = client.delete(path, headers={**context["headers"], "If-Match": str(own_version)})
    assert withdrawal.status_code == 204
    assert read(client, context, proposed, partner=True).json()["reflections"] == []


def test_save_freezes_selection_and_survives_pro_expiry(client, session, context):  # type: ignore[no-untyped-def]
    memory(session, context)
    proposed = request(client, context).json()
    generate(session, context, proposed)
    current = read(client, context, proposed).json()
    saved = client.post(
        f"{context['path']}/{proposed['id']}/save",
        headers={**context["headers"], "If-Match": str(current["version"])},
    )
    assert saved.status_code == 200 and saved.json()["savedAt"]
    change = client.put(
        f"{context['path']}/{proposed['id']}/selection",
        headers={**context["headers"], "If-Match": str(saved.json()["version"])},
        json={"sourceKeys": []},
    )
    assert change.status_code == 409
    context["grant"].effective_until = NOW - timedelta(days=1)
    session.flush()
    assert read(client, context, proposed).status_code == 200
    assert client.get(context["path"], headers=context["headers"]).json()["canCompose"] is False
    assert request(client, context).status_code == 403


def test_changed_or_withdrawn_source_scrubs_derived_prose(client, session, context):  # type: ignore[no-untyped-def]
    heart = HeartMoment(
        space_id=context["space"].id,
        owner_id=context["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 10, 20),
        payload=HeartMomentPayload(text="Formerly shared words", emotion=HeartEmotion.LOVED),
    )
    session.add(heart)
    session.flush()
    proposed = request(client, context).json()
    generate(session, context, proposed)
    stored = session.get(RecapEdition, UUID(proposed["id"]))
    stored.payload = RecapPayload(
        headline="Derived shared words", introduction="A generated introduction"
    )
    session.flush()
    heart.privacy_class = PrivacyClass.OWNER_ONLY.value
    session.flush()
    assert stored.payload.headline is None
    result = read(client, context, proposed, partner=True).json()
    assert result["headline"] is None and result["introduction"] is None
    assert result["sources"][0]["available"] is False
    assert result["sources"][0]["title"] is None
    assert "Formerly shared words" not in str(result)


def test_optimistic_selection_and_foreign_recap_protection(client, session, context):  # type: ignore[no-untyped-def]
    memory(session, context)
    proposed = request(client, context).json()
    generate(session, context, proposed)
    current = read(client, context, proposed).json()
    path = f"{context['path']}/{proposed['id']}/selection"
    update = client.put(
        path,
        headers={**context["headers"], "If-Match": str(current["version"])},
        json={"sourceKeys": []},
    )
    assert update.status_code == 200
    stale = client.put(
        path,
        headers={**context["headers"], "If-Match": str(current["version"])},
        json={"sourceKeys": []},
    )
    assert stale.status_code == 409
    foreign = client.get(
        f"/api/v1/spaces/{context['foreign'].id}/recaps/{proposed['id']}",
        headers=context["headers"],
    )
    assert foreign.status_code == 404
    malformed = client.get(f"{context['path']}/malformed", headers=context["headers"])
    assert malformed.status_code == 404


def test_year_uses_full_period_and_auto_prepare_queues_current_periods(client, session, context):  # type: ignore[no-untyped-def]
    for month in range(1, 11):
        memory(session, context, day=date(2026, month, 10))
    ready = client.post(f"{context['path']}/prepare", headers=context["headers"])
    assert ready.status_code == 202
    annual = request(client, context, kind="YEAR", month=0).json()
    generate(session, context, annual)
    result = read(client, context, annual).json()
    assert result["startsOn"] == "2026-01-01"
    assert len({item["occurredOn"][:7] for item in result["sources"]}) == 8
    assert request(client, context, month=12).status_code == 422


def test_recap_transfer_retains_shared_words_and_only_the_exporters_private_draft(
    client, session, context, encryption
):  # type: ignore[no-untyped-def]
    import io
    import json
    from zipfile import ZipFile

    from eimir.authorization import AuthorizationContext
    from eimir.recaps.models import RecapReflection
    from eimir.transfer import jobs as transfer_jobs
    from eimir.transfer import service as transfer_service
    from eimir.transfer.models import ImportStatus, TransferScope

    encryption.apply("required")
    original = memory(session, context)
    response = request(client, context)
    generate(session, context, response.json())
    recap_id = UUID(response.json()["id"])
    anna = AuthorizationContext(account_id=context["anna"].id, space_id=context["space"].id)
    ben = AuthorizationContext(account_id=context["ben"].id, space_id=context["space"].id)
    value = service.edition(session, anna, recap_id)
    service.write_reflection(session, anna, value, "Shared words", True, 0)
    service.write_reflection(session, anna, value, "Anna private draft", False, 0)
    service.write_reflection(session, ben, value, "Ben private draft", False, 0)
    target = make_space(session, context["anna"])
    relationship_service.add_member(session, target.id, context["ben"])
    target_context = AuthorizationContext(account_id=context["anna"].id, space_id=target.id)
    with transfer_service.build_export_archive(session, anna, TransferScope.PERSONAL) as bundle:
        with ZipFile(bundle) as archive:
            raw = archive.read("recaps.json")
            assert b"Shared words" in raw and b"Anna private draft" in raw
            assert b"Ben private draft" not in raw
            tables = {table["name"]: table["rows"] for table in json.loads(raw)["tables"]}
            assert tables["recap_sources"][0]["sourceId"] == str(original.id)
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        transfer = transfer_service.create_import(session, target_context, bundle, size=size)
    transfer_jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    transfer_service.request_apply(session, target_context, str(transfer.id))
    transfer_jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED.value
    imported = session.scalar(select(RecapEdition).where(RecapEdition.space_id == target.id))
    assert imported and imported.saved_at and imported.customized
    projected = service.project(session, target_context, imported)
    assert projected["sources"][0]["available"]
    assert projected["own_draft"]["text"] == "Anna private draft"
    assert projected["reflections"][0]["text"] == "Shared words"
    assert (
        len(
            session.scalars(
                select(RecapReflection).where(RecapReflection.space_id == target.id)
            ).all()
        )
        == 2
    )
