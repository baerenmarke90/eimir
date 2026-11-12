"""Real PostgreSQL boundaries for automatic recap artifacts and private drafts."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import func, select

from eimir.attachments import binding
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.comments.models import Comment, CommentPayload
from eimir.core import clock
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.jobs.models import Job
from eimir.memories.models import (
    Memory,
    MemoryPayload,
    MemoryPhotoReaction,
    PhotoReaction,
)
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
    assert result["facts"]["memories"] == 1
    assert result["facts"]["heartMoments"] == 0
    assert result["facts"]["activeDays"] == 1
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
    assert result["facts"] is None
    assert result["sources"][0]["available"] is False
    assert result["sources"][0]["title"] is None
    assert "Formerly shared words" not in str(result)


def test_a_changed_source_queues_one_delayed_rewrite_of_an_automatic_proposal(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    from types import SimpleNamespace

    from eimir.recaps import invalidation, local_ai

    enabled = SimpleNamespace(recap_ai_url="http://recap-ai:11434")
    monkeypatch.setattr(invalidation, "get_settings", lambda: enabled)
    item = memory(session, context)
    proposed = request(client, context).json()
    generate(session, context, proposed)
    stored = session.get(RecapEdition, UUID(proposed["id"]))
    stored.payload = RecapPayload(headline="Derived words", introduction="An introduction")
    session.flush()

    def rewrites():  # type: ignore[no-untyped-def]
        queued = session.scalars(select(Job).where(Job.kind == service.GENERATE_JOB)).all()
        return [job for job in queued if "account_id" not in job.payload]

    item.payload = MemoryPayload(title="A corrected title", body="Corrected shared words")
    session.flush()
    assert stored.payload.headline is None and stored.status == "READY"
    (job,) = rewrites()
    requested = session.scalars(select(Job).where(Job.id != job.id)).first()
    assert job.run_after - requested.run_after >= invalidation.REWRITE_DELAY
    assert job.payload["request_token"] == str(stored.request_token)
    # Further edits before the rewrite do not queue more inference.
    item.payload = MemoryPayload(title="A second correction", body="Corrected shared words")
    session.flush()
    assert len(rewrites()) == 1

    monkeypatch.setattr(jobs, "get_settings", lambda: enabled)
    seen: list[str] = []

    def compose(evidence, locale, period):  # type: ignore[no-untyped-def]
        seen.extend(entry["title"] for entry in evidence)
        return local_ai.Narration(
            title="Rewritten", introduction="From the corrected words.", source_keys=["x"]
        )

    monkeypatch.setattr(local_ai, "compose", compose)
    # The job releases its read transaction before inference; the fixture's must survive.
    monkeypatch.setattr(session, "rollback", lambda: None)
    jobs.generate(session, dict(job.payload))
    session.flush()
    assert seen == ["A second correction"]
    result = read(client, context, proposed, partner=True).json()
    assert result["headline"] == "Rewritten"
    assert result["sources"][0]["title"] == "A second correction"

    # A retained edition keeps the factual template; its wording stays frozen.
    stored.saved_at = NOW
    session.flush()
    item.payload = MemoryPayload(title="A third correction", body="Corrected shared words")
    session.flush()
    assert stored.payload.headline is None and len(rewrites()) == 1


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
    assert len({item["occurredOn"][:7] for item in result["sources"]}) == 10
    assert result["facts"]["memories"] == 10 and result["facts"]["activeDays"] == 10
    assert result["facts"]["busiestMonth"] is None
    memory(session, context, day=date(2026, 10, 10))
    facts = read(client, context, annual, partner=True).json()["facts"]
    assert facts["memories"] == 11 and facts["activeDays"] == 10
    assert facts["busiestMonth"] == 10
    assert request(client, context, month=12).status_code == 422


def test_earlier_periods_are_prepared_in_bounded_batches_without_a_request(
    client, session, context
):  # type: ignore[no-untyped-def]
    for year in (2024, 2025):
        for month in range(1, 11):
            memory(session, context, day=date(year, month, 10))

    def count(kind):  # type: ignore[no-untyped-def]
        return session.scalar(select(func.count()).select_from(Job).where(Job.kind == kind))

    def editions():  # type: ignore[no-untyped-def]
        return session.scalar(select(func.count()).select_from(RecapEdition))

    def waiting():  # type: ignore[no-untyped-def]
        overview = client.get(context["path"], headers=context["headers"]).json()
        return [(item["kind"], item["year"], item["month"]) for item in overview["periods"]]

    # 20 earlier months and the year 2024, plus the three periods prepared right away.
    assert len(waiting()) == 21 + 3
    assert client.post(f"{context['path']}/prepare", headers=context["headers"]).status_code == 202
    # Current month, current year and the completed previous year, plus one batch.
    assert editions() == 3 + service.BACKFILL_BATCH
    left = waiting()
    assert len(left) == 21 - service.BACKFILL_BATCH
    # The newest earlier periods come first.
    assert ("MONTH", 2025, 10) not in left and ("MONTH", 2024, 1) in left
    assert count(service.BACKFILL_JOB) == 1

    assert client.post(f"{context['path']}/prepare", headers=context["headers"]).status_code == 202
    assert count(service.BACKFILL_JOB) == 1
    payload = {"space_id": str(context["space"].id), "account_id": str(context["anna"].id)}
    for _ in range(4):
        jobs.backfill(session, payload)
        session.flush()
    assert waiting() == []
    assert editions() == 3 + 21
    assert count(service.GENERATE_JOB) == editions()
    # Nothing is left, so the continuation does not reschedule itself again.
    assert count(service.BACKFILL_JOB) == 1

    context["grant"].status = EntitlementStatus.REVOKED.value
    session.flush()
    memory(session, context, day=date(2023, 5, 10))
    jobs.backfill(session, payload)
    assert editions() == 3 + 21


def test_completed_periods_are_retained_after_a_grace_week_and_keep_accepting_words(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    memory(session, context, day=date(2026, 9, 12))
    memory(session, context, day=date(2026, 10, 21))
    prepare = lambda: client.post(f"{context['path']}/prepare", headers=context["headers"])  # noqa: E731

    def editions(month):  # type: ignore[no-untyped-def]
        return session.scalars(
            select(RecapEdition)
            .where(RecapEdition.kind == "MONTH", RecapEdition.month == month)
            .execution_options(populate_existing=True)
        ).all()

    def compose(month):  # type: ignore[no-untyped-def]
        (value,) = editions(month)
        generate(session, context, {"id": str(value.id)})
        return value

    assert prepare().status_code == 202
    september, october = compose(9), compose(10)
    assert prepare().status_code == 202
    # September ended a month ago; the running October is never retained.
    assert editions(9)[0].saved_at is not None and editions(10)[0].saved_at is None
    assert october.is_partial is True

    # A proposal that still describes a partial month is recomposed before it is kept.
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 11, 5, 12, tzinfo=UTC))
    assert prepare().status_code == 202
    assert editions(10)[0].saved_at is None and editions(10)[0].status == "PENDING"
    compose(10)
    assert prepare().status_code == 202
    assert editions(10)[0].saved_at is None  # 31 October + 7 days has not passed
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 11, 8, 12, tzinfo=UTC))
    assert prepare().status_code == 202
    (kept,) = editions(10)
    assert kept.saved_at is not None and kept.is_partial is False
    assert kept.through_on == date(2026, 10, 31)
    # Reopening the period returns the retained edition instead of a second one.
    assert prepare().status_code == 202
    assert len(editions(10)) == 1 and len(editions(9)) == 1

    current = read(client, context, {"id": str(september.id)}).json()
    frozen = client.put(
        f"{context['path']}/{september.id}/selection",
        headers={**context["headers"], "If-Match": str(current["version"])},
        json={"sourceKeys": []},
    )
    assert frozen.status_code == 409
    words = client.put(
        f"{context['path']}/{september.id}/reflection",
        headers=context["partner"],
        json={"text": "Still our favorite month.", "shared": True, "version": 0},
    )
    assert words.status_code == 200
    assert [item["text"] for item in words.json()["reflections"]] == ["Still our favorite month."]


def test_a_curated_month_is_retained_as_selected_and_only_with_the_capability(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    first, second = memory(session, context), memory(session, context, day=date(2026, 10, 5))
    proposed = request(client, context).json()
    generate(session, context, proposed)
    current = read(client, context, proposed).json()
    chosen = client.put(
        f"{context['path']}/{proposed['id']}/selection",
        headers={**context["headers"], "If-Match": str(current["version"])},
        json={"sourceKeys": [f"MEMORY:{second.id}"]},
    )
    assert chosen.status_code == 200
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 11, 20, 12, tzinfo=UTC))
    context["grant"].status = EntitlementStatus.REVOKED.value
    session.flush()
    jobs.scan(session, {})
    session.flush()
    assert read(client, context, proposed).json()["savedAt"] is None
    context["grant"].status = EntitlementStatus.ACTIVE.value
    session.flush()
    jobs.scan(session, {})
    session.flush()
    kept = read(client, context, proposed).json()
    assert kept["savedAt"] and kept["isPartial"] is False and kept["throughOn"] == "2026-10-31"
    assert [item["id"] for item in kept["sources"]] == [str(second.id)]
    assert first.id != second.id


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


def comment(session, context, item, author, body, minutes):  # type: ignore[no-untyped-def]
    row = Comment(
        space_id=context["space"].id,
        owner_id=author.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        target_type="MEMORY",
        target_id=item.id,
        payload=CommentPayload(body=body),
        created_at=NOW - timedelta(minutes=minutes),
    )
    session.add(row)
    session.flush()
    return row


def sources_of(client, context, created):  # type: ignore[no-untyped-def]
    return {item["id"]: item for item in read(client, context, created).json()["sources"]}


def test_a_scene_quotes_the_newest_comment_of_the_other_member_and_follows_edits(
    client, session, context
):  # type: ignore[no-untyped-def]
    item = memory(session, context)  # written by Anna
    comment(session, context, item, context["anna"], "My own comment is never quoted.", 1)
    comment(session, context, item, context["ben"], "An older note from Ben.", 30)
    newest = comment(session, context, item, context["ben"], "word " * 60, 5)
    created = request(client, context).json()
    generate(session, context, created)

    quoted = sources_of(client, context, created)[str(item.id)]["quote"]
    assert quoted["authorName"] == "Ben" and quoted["text"].endswith("\u2026")
    assert len(quoted["text"]) <= 141 and "word word" in quoted["text"]

    newest.payload = CommentPayload(body="Edited by Ben.")
    session.flush()
    assert sources_of(client, context, created)[str(item.id)]["quote"]["text"] == "Edited by Ben."
    session.delete(newest)
    session.flush()
    assert (
        sources_of(client, context, created)[str(item.id)]["quote"]["text"]
        == "An older note from Ben."
    )


def test_a_scene_without_a_foreign_comment_has_no_quote(client, session, context):  # type: ignore[no-untyped-def]
    item = memory(session, context)
    comment(session, context, item, context["anna"], "Only the author spoke.", 1)
    created = request(client, context).json()
    generate(session, context, created)
    assert sources_of(client, context, created)[str(item.id)]["quote"] is None


def photo_memory(session, context, anna, ben, day):  # type: ignore[no-untyped-def]
    item = memory(session, context, day=day)
    row = Attachment(
        space_id=context["space"].id,
        owner_id=context["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/png",
        declared_size=8,
        mime_type="image/png",
        size=8,
        width=1,
        height=1,
        has_thumbnail=False,
        ready_at=NOW,
        payload=AttachmentPayload(original_name="cover.png"),
    )
    session.add(row)
    session.flush()
    session.add(binding.MemoryAttachment(memory_id=item.id, attachment_id=row.id, position=0))
    reactions = [
        MemoryPhotoReaction(attachment_id=row.id, account_id=context["anna"].id, reaction=anna),
        MemoryPhotoReaction(attachment_id=row.id, account_id=context["ben"].id, reaction=ben),
    ]
    item.payload = item.payload.model_copy(update={"photo_reactions": reactions})
    session.flush()
    return item


def test_the_reaction_line_needs_both_members_to_react_alike_and_stays_rare(
    client, session, context
):  # type: ignore[no-untyped-def]
    both = photo_memory(session, context, PhotoReaction.LOVE, PhotoReaction.LOVE, date(2026, 3, 5))
    laugh = photo_memory(
        session, context, PhotoReaction.LAUGH, PhotoReaction.LAUGH, date(2026, 4, 5)
    )
    mixed = photo_memory(
        session, context, PhotoReaction.LOVE, PhotoReaction.LAUGH, date(2026, 5, 5)
    )
    sad = photo_memory(session, context, PhotoReaction.SAD, PhotoReaction.SAD, date(2026, 6, 5))
    like = photo_memory(session, context, PhotoReaction.LIKE, PhotoReaction.LIKE, date(2026, 7, 5))
    extra = [
        photo_memory(
            session, context, PhotoReaction.CELEBRATE, PhotoReaction.CELEBRATE, date(2026, day, 5)
        )
        for day in (8, 9)
    ]
    created = request(client, context, kind="YEAR", month=0).json()
    generate(session, context, created)

    lines = {
        key: value["mutualReaction"] for key, value in sources_of(client, context, created).items()
    }
    assert lines[str(both.id)] == "LOVE" and lines[str(laugh.id)] == "LAUGH"
    assert (
        lines[str(mixed.id)] is None and lines[str(sad.id)] is None and lines[str(like.id)] is None
    )
    # Four qualify (one pool allows four per month, so each sits in its own month); only the
    # first three in reading order keep the line.
    assert sorted(line for line in lines.values() if line) == ["CELEBRATE", "LAUGH", "LOVE"]
    assert extra
