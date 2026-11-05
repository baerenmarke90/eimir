"""Explicit real-codec/database acceptance owned by the Media Video workflow.

This file is selected explicitly by its mandatory no-skips codec job. Its
acceptance_ name keeps work requiring optional binaries out of generic pytest discovery;
ordinary database cases remain in tests/integration without a codec dependency.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest

from eimir.attachments import video_jobs
from eimir.attachments.models import Attachment, AttachmentStatus
from tests.conftest import auth, requires_database
from tests.support.video import grant
from tests.support.video import owner as owner
from tests.support.video import processor as processor

pytestmark = [pytest.mark.integration, requires_database]


def test_hevc_hdr_uses_the_existing_intake_worker_and_ready_publication(
    client, session, owner, processor
):  # type: ignore[no-untyped-def]
    grant(session, owner)
    content = (Path(__file__).parents[1] / "fixtures/media/hevc-hlg.mp4").read_bytes()
    response = client.post(
        f"/api/v1/spaces/{owner[1].id}/attachments",
        json={
            "mediaType": "VIDEO",
            "expectedMimeType": "video/mp4",
            "expectedSize": len(content),
            "originalName": "synthetic-recording.mp4",
        },
        headers=auth(owner[2]),
    )
    assert response.status_code == 201, response.text
    identifier = response.json()["attachment"]["id"]
    path = f"/api/v1/spaces/{owner[1].id}/attachments/{identifier}"
    assert client.put(path + "/content", content=content, headers=auth(owner[2])).status_code == 204
    assert client.post(path + "/finalize", json={}, headers=auth(owner[2])).status_code == 202
    video_jobs.validate(session, {"attachmentId": identifier})
    attachment = session.get(Attachment, UUID(identifier))
    session.refresh(attachment)
    assert attachment.status == AttachmentStatus.READY.value
    assert attachment.mime_type == "video/mp4"
    assert (attachment.width, attachment.height) == (96, 64)
    assert attachment.has_thumbnail is True
    assert attachment.failure_code is None
    assert attachment.payload.original_name == "synthetic-recording.mp4"
    assert attachment.payload.preserve_metadata is False
