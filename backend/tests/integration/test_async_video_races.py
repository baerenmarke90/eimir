"""Real PostgreSQL publication races use the same independent worker transactions."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from threading import Barrier, Event

import pytest
from sqlalchemy import select

from eimir.attachments import binding, video_jobs, videos
from eimir.attachments import service as attachments
from eimir.attachments.models import Attachment, AttachmentPayload
from eimir.authorization import AuthorizationContext
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.media import get_media_store
from eimir.memories import service as memories
from eimir.memories.models import Memory, MemoryPayload
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def world(production_client, *, count=1, large_peers=False):  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker.begin() as session:
        account = make_account(session, "Video author")
        space = make_space(session, account)
        memory = Memory(
            space_id=space.id,
            owner_id=account.id,
            privacy_class="SPACE_SHARED",
            payload=MemoryPayload(title="A shared day", body=""),
        )
        session.add(memory)
        media = [
            Attachment(
                space_id=space.id,
                owner_id=account.id,
                privacy_class="OWNER_ONLY",
                media_type="VIDEO",
                status="VALIDATING",
                declared_mime_type="video/mp4",
                declared_size=10,
                uploaded_at=now(),
                payload=AttachmentPayload(original_name="clip.mp4"),
            )
            for _ in range(count)
        ]
        if large_peers:
            media.extend(
                Attachment(
                    space_id=space.id,
                    owner_id=account.id,
                    privacy_class="OWNER_ONLY",
                    media_type="VIDEO",
                    status="READY",
                    declared_mime_type="video/mp4",
                    declared_size=binding.MAX_GALLERY_TOTAL_SIZE // 2 - 15,
                    size=binding.MAX_GALLERY_TOTAL_SIZE // 2 - 15,
                    ready_at=now(),
                    payload=AttachmentPayload(original_name="photo.jpg"),
                )
                for _ in range(2)
            )
        session.add_all(media)
        session.flush()
        ids = [item.id for item in media]
        context = AuthorizationContext(account_id=account.id, space_id=space.id)
        memory_id = memory.id
        for item in media[:count]:
            get_media_store().put(
                attachments.storage_key_for(item), BytesIO(b"0123456789"), "video/mp4"
            )
    return maker, context, memory_id, ids


@pytest.mark.parametrize("mutation", ["attach", "classify", "delete"])
def test_worker_preserves_binding_classification_and_deletion_winners(
    production_client, monkeypatch, mutation
):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_VIDEO_UPLOAD_ENABLED", "true")
    get_settings.cache_clear()
    maker, context, memory_id, ids = world(production_client)
    if mutation != "attach":
        with maker.begin() as session:
            memories.replace_attachments(
                session, context, memory_id, expected_version=1, entries=[(ids[0], 0)]
            )
    started, release = Event(), Event()

    def process(source: Path, directory: Path) -> videos.ProcessedVideo:
        started.set()
        assert release.wait(10), "The concurrent mutation did not finish."
        output = directory / "validated.mp4"
        output.write_bytes(b"validated")
        return videos.ProcessedVideo(output, 9, 96, 64, 1, None)

    monkeypatch.setattr(videos, "process", process)

    def run():  # type: ignore[no-untyped-def]
        with maker() as session:
            video_jobs.validate(session, {"attachmentId": str(ids[0])})

    with ThreadPoolExecutor(max_workers=1) as pool:
        result = pool.submit(run)
        try:
            assert started.wait(5)
            with maker.begin() as session:
                memory = session.get(Memory, memory_id)
                memories.replace_attachments(
                    session,
                    context,
                    memory_id,
                    expected_version=memory.version,
                    entries=[] if mutation == "delete" else [(ids[0], 0)],
                    sensitivity={ids[0]: True},
                )
        finally:
            release.set()
        result.result(timeout=15)
    with maker() as session:
        attachment = session.get(Attachment, ids[0])
        assert attachment.status == ("DELETING" if mutation == "delete" else "READY")
        if mutation != "delete":
            assert attachment.payload.is_sensitive is True
            assert binding.parent_of(session, ids[0]) == ("MEMORY", memory_id)
    get_settings.cache_clear()


def test_concurrent_video_publications_cannot_overfill_the_same_gallery(
    production_client, monkeypatch
):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_VIDEO_UPLOAD_ENABLED", "true")
    get_settings.cache_clear()
    maker, context, memory_id, ids = world(production_client, count=2, large_peers=True)
    with maker.begin() as session:
        memories.replace_attachments(
            session,
            context,
            memory_id,
            expected_version=1,
            entries=[(identifier, position) for position, identifier in enumerate(ids)],
        )
    barrier = Barrier(2)

    def process(source: Path, directory: Path) -> videos.ProcessedVideo:
        barrier.wait(timeout=10)
        output = directory / "validated.mp4"
        output.write_bytes(b"validated-video-data")
        return videos.ProcessedVideo(output, 20, 96, 64, 1, None)

    monkeypatch.setattr(videos, "process", process)

    def run(identifier):  # type: ignore[no-untyped-def]
        with maker() as session:
            video_jobs.validate(session, {"attachmentId": str(identifier)})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [pool.submit(run, identifier) for identifier in ids[:2]]
        for result in results:
            result.result(timeout=20)
    with maker() as session:
        rows = list(session.scalars(select(Attachment).where(Attachment.id.in_(ids))))
        assert sorted(row.status for row in rows if row.id in ids[:2]) == [
            "FAILED",
            "READY",
        ]
        assert sum(binding.reserved_size(row) for row in rows) == binding.MAX_GALLERY_TOTAL_SIZE
        assert [row.failure_code for row in rows if row.status == "FAILED"] == [
            "ATTACHMENT_LIMIT_EXCEEDED"
        ]
    get_settings.cache_clear()
