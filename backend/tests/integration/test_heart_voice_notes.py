"""Voice media reuses canonical parent privacy, deletion and upload ownership."""

import os
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from eimir.attachments import audios, service, video_jobs
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.config import get_settings
from eimir.jobs.models import Job
from eimir.media import get_media_store
from tests.conftest import auth, requires_database
from tests.integration.test_heart_moments import couple as couple

pytestmark = [pytest.mark.integration, requires_database]
SAMPLE = Path(__file__).parents[1] / "fixtures/media/voice/short.ogg"


@pytest.fixture(autouse=True)
def audio_enabled(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_AUDIO_UPLOAD_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def restore_decoder(monkeypatch):  # type: ignore[no-untyped-def]
    """Run the real codec in the restricted matrix; isolate its port in DB-only CI."""
    executable = os.environ.get("EIMIR_TEST_FFMPEG")
    probe = os.environ.get("EIMIR_TEST_FFPROBE")
    if executable and probe:
        monkeypatch.setenv("EIMIR_FFMPEG_PATH", executable)
        monkeypatch.setenv("EIMIR_FFPROBE_PATH", probe)
        get_settings.cache_clear()
        return audios.process
    return None


def upload(client, session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    base = f"/api/v1/spaces/{couple['space'].id}/attachments"
    token = auth(couple["token_a"])
    created = client.post(
        base,
        json={
            "mediaType": "AUDIO",
            "expectedMimeType": "audio/ogg",
            "expectedSize": SAMPLE.stat().st_size,
            "originalName": "voice.ogg",
        },
        headers=token,
    )
    assert created.status_code == 201, created.text  # Core: no Premium grant.
    identifier = created.json()["attachment"]["id"]
    assert (
        client.put(
            f"{base}/{identifier}/content", content=SAMPLE.read_bytes(), headers=token
        ).status_code
        == 204
    )
    assert client.post(f"{base}/{identifier}/finalize", json={}, headers=token).status_code == 202
    assert (
        session.scalar(select(Job).where(Job.kind == service.ATTACHMENT_AUDIO_VALIDATION))
        is not None
    )

    # Isolate DB publication; decoder acceptance is exercised separately with real media.
    def processed(source: Path, directory: Path) -> audios.ProcessedAudio:
        output = directory / "voice.m4a"
        output.write_bytes((SAMPLE.parent / "short.m4a").read_bytes())
        return audios.ProcessedAudio(output, output.stat().st_size, 1)

    monkeypatch.setattr(audios, "process", processed)
    video_jobs.validate(session, {"attachmentId": identifier})
    session.expire_all()
    assert session.get(Attachment, UUID(identifier)).status == AttachmentStatus.READY
    return identifier


def create(client, couple, identifier, visibility="PRIVATE", key=None):  # type: ignore[no-untyped-def]
    headers = auth(couple["token_a"])
    if key:
        headers["Idempotency-Key"] = str(key)
    return client.post(
        f"/api/v1/spaces/{couple['space'].id}/heart-moments",
        headers=headers,
        json={
            "text": "",
            "emotion": "LOVED",
            "visibility": visibility,
            "happenedOn": "2026-11-06",
            "audioTitle": "Good night",
            "audioSpeakerName": "Ben",
            "attachments": [{"attachmentId": identifier, "position": 0}],
        },
    )


def test_audio_only_parent_and_metadata_follow_private_access(client, session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    identifier = upload(client, session, couple, monkeypatch)
    response = create(client, couple, identifier)
    assert response.status_code == 201, response.text
    moment = response.json()
    assert moment["audioTitle"] == "Good night"
    assert moment["audioSpeakerName"] == "Ben"
    assert moment["authorId"] == str(couple["anna"].id)
    assert moment["attachments"][0]["mediaType"] == "AUDIO"
    parent = f"/api/v1/spaces/{couple['space'].id}/heart-moments/{moment['id']}"
    content = f"/api/v1/spaces/{couple['space'].id}/attachments/{identifier}/content"
    assert client.get(content, headers=auth(couple["token_a"])).status_code == 200
    for who in ["token_b", "token_outsider"]:
        assert client.get(parent, headers=auth(couple[who])).status_code == 404
        assert client.get(content, headers=auth(couple[who])).status_code == 404


def test_shared_audio_revocation_and_delete_use_parent(client, session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    identifier = upload(client, session, couple, monkeypatch)
    moment = create(client, couple, identifier, "SHARED").json()
    base = f"/api/v1/spaces/{couple['space'].id}"
    parent = f"{base}/heart-moments/{moment['id']}"
    content = f"{base}/attachments/{identifier}/content"
    assert client.get(content, headers=auth(couple["token_b"])).status_code == 200
    headers = {**auth(couple["token_a"]), "If-Match": str(moment["version"])}
    hidden = client.patch(parent + "/visibility", json={"visibility": "PRIVATE"}, headers=headers)
    assert hidden.status_code == 200, hidden.text
    assert client.get(content, headers=auth(couple["token_b"])).status_code == 404
    deleted = client.delete(
        parent, headers={**auth(couple["token_a"]), "If-Match": str(hidden.json()["version"])}
    )
    assert deleted.status_code == 204, deleted.text
    session.expire_all()
    assert session.get(Attachment, UUID(identifier)).status == AttachmentStatus.DELETING
    assert client.get(content, headers=auth(couple["token_a"])).status_code == 404
    attachment = session.get(Attachment, UUID(identifier))
    key = service.storage_key_for(attachment)
    assert service.purge(session, attachment)
    session.flush()
    assert not get_media_store().exists(key)


def test_voice_idempotency_includes_protected_labels(client, session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    identifier = upload(client, session, couple, monkeypatch)
    key = uuid4()
    one = create(client, couple, identifier, key=key)
    two = create(client, couple, identifier, key=key)
    assert (one.status_code, two.status_code) == (201, 200)
    assert one.json()["id"] == two.json()["id"]


def test_audio_cover_and_second_voice_are_rejected(client, session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    identifier = upload(client, session, couple, monkeypatch)
    second = upload(client, session, couple, monkeypatch)
    base = f"/api/v1/spaces/{couple['space'].id}/heart-moments"
    data = {
        "text": "",
        "emotion": "LOVED",
        "visibility": "PRIVATE",
        "happenedOn": "2026-11-06",
        "attachments": [{"attachmentId": identifier, "position": 0}],
        "selectedCoverAttachmentId": identifier,
    }
    assert client.post(base, json=data, headers=auth(couple["token_a"])).status_code == 422
    data.pop("selectedCoverAttachmentId")
    data["attachments"].append({"attachmentId": second, "position": 1})
    assert client.post(base, json=data, headers=auth(couple["token_a"])).status_code == 422


def test_voice_intake_disabled_keeps_existing_audio_readable(client, session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    identifier = upload(client, session, couple, monkeypatch)
    assert create(client, couple, identifier).status_code == 201
    monkeypatch.setenv("EIMIR_AUDIO_UPLOAD_ENABLED", "false")
    get_settings.cache_clear()
    base = f"/api/v1/spaces/{couple['space'].id}/attachments"
    assert (
        client.get(f"{base}/{identifier}/content", headers=auth(couple["token_a"])).status_code
        == 200
    )
    rejected = client.post(
        base,
        json={
            "mediaType": "AUDIO",
            "expectedMimeType": "audio/ogg",
            "expectedSize": 10,
            "originalName": "voice.ogg",
        },
        headers=auth(couple["token_a"]),
    )
    assert rejected.status_code == 415


@pytest.mark.parametrize("encrypted", [False, True])
def test_voice_transfer_retains_labels_and_revalidates_bytes(
    client, session, couple, monkeypatch, restore_decoder, encryption, encrypted
):  # type: ignore[no-untyped-def]
    import io

    from eimir.authorization import AuthorizationContext
    from eimir.heart_moments.models import HeartMoment
    from eimir.relationship import service as relationships
    from eimir.transfer import jobs
    from eimir.transfer import service as transfers
    from eimir.transfer.models import ImportStatus, TransferScope
    from tests.conftest import make_space

    if encrypted:
        encryption.apply("required")
    decode = restore_decoder
    identifier = upload(client, session, couple, monkeypatch)
    assert create(client, couple, identifier, "SHARED").status_code == 201
    target = make_space(session, couple["anna"])
    relationships.add_member(session, target.id, couple["ben"])
    source_context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    target_context = AuthorizationContext(account_id=couple["anna"].id, space_id=target.id)
    with transfers.build_export_archive(session, source_context, TransferScope.SHARED) as bundle:
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        if not encrypted:
            import hashlib
            import json
            from zipfile import ZIP_STORED, ZipFile

            from eimir.transfer.archive import TransferArchiveError

            # A correct checksum cannot legitimize a forged media-size claim.
            with ZipFile(bundle) as archive:
                entries = {entry.filename: archive.read(entry) for entry in archive.infolist()}
            index = json.loads(entries["media/index.json"])
            index["items"][0]["size"] = 1
            entries["media/index.json"] = json.dumps(index).encode()
            manifest = json.loads(entries["manifest.json"])
            manifest["checksums"]["media/index.json"] = hashlib.sha256(
                entries["media/index.json"]
            ).hexdigest()
            entries["manifest.json"] = json.dumps(manifest).encode()
            forged = io.BytesIO()
            with ZipFile(forged, "w", compression=ZIP_STORED) as archive:
                for name, content in entries.items():
                    archive.writestr(name, content)
            with pytest.raises(TransferArchiveError):
                transfers.validate_import_bundle(
                    session, target_context, forged, compressed_size=forged.tell()
                )
            bundle.seek(0)
        transfer = transfers.create_import(session, target_context, bundle, size=size)
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    assert transfer.status == ImportStatus.READY_TO_APPLY
    transfers.request_apply(session, target_context, str(transfer.id))
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED
    moment = session.scalar(select(HeartMoment).where(HeartMoment.space_id == target.id))
    assert moment.payload.audio_title == "Good night"
    assert moment.payload.audio_speaker_name == "Ben"
    imported = session.get(Attachment, moment.attachment_id)
    assert imported.status == AttachmentStatus.VALIDATING
    assert imported.duration_seconds is None
    assert imported.id != UUID(identifier)
    # The restore reuses the restricted decoder, including after intake is disabled.
    monkeypatch.setenv("EIMIR_AUDIO_UPLOAD_ENABLED", "false")
    get_settings.cache_clear()
    if decode is not None:
        monkeypatch.setattr(audios, "process", decode)
    video_jobs.validate(session, {"attachmentId": str(imported.id)})
    session.refresh(imported)
    assert imported.status == AttachmentStatus.READY
    assert imported.duration_seconds == 1
    assert imported.mime_type == "audio/mp4"
