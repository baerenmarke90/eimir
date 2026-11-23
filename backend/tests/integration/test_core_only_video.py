"""Video on an instance without the Pro plugin (Decision 0017, #2085).

The video processor and its validation job are plugin code; the shared media
pipeline, voice notes, playback, export, restore, deletion and retention are
Core. Without the plugin a server behaves like one without a video processor
even when the operator enabled video: no new video is accepted, the policy says
so, queued video validations stay pending, and voice notes keep working. These
tests are not Pro feature tests: the Core-only CI job runs them with
``EIMIR_PLUGINS=""``; the plugin-loaded job runs them against a simulated absent
plugin.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager, nullcontext

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from eimir.attachments.limits import video_processing_available
from eimir.attachments.service import ATTACHMENT_AUDIO_VALIDATION, ATTACHMENT_VIDEO_VALIDATION
from eimir.jobs import video_worker
from eimir.jobs.worker import JobRegistry
from eimir.plugins.loader import loaded_plugins
from tests.conftest import auth, requires_database
from tests.support.plugins import plugins_loaded, with_pro_plugin, without_plugins
from tests.support.video import grant
from tests.support.video import owner as owner

pytestmark = [pytest.mark.integration, requires_database]


@contextmanager
def core_only() -> Iterator[None]:
    """Run Core-only: for real in the Core-only job, simulated in the plugin-loaded one."""
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


def _create_video(client: TestClient, owner) -> object:  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/spaces/{owner[1].id}/attachments",
        json={
            "mediaType": "VIDEO",
            "expectedMimeType": "video/mp4",
            "expectedSize": 10,
            "originalName": "our-video.mp4",
        },
        headers=auth(owner[2]),
    )


def test_without_the_plugin_no_video_is_accepted_despite_setting_and_grant(
    client: TestClient, session: Session, owner
) -> None:  # type: ignore[no-untyped-def]
    # The operator enabled video (fixture) and the Space holds Premium.
    grant(session, owner)
    session.flush()
    policy_path = f"/api/v1/spaces/{owner[1].id}/attachment-upload-policy"
    with with_pro_plugin():
        assert video_processing_available() is True
    with core_only():
        assert video_processing_available() is False
        policy = client.get(policy_path, headers=auth(owner[2])).json()
        assert policy["videoProcessingEnabled"] is False
        assert policy["videoUploadAllowed"] is False
        assert not any(mime.startswith("video/") for mime in policy["acceptedMimeTypes"])
        # Like a server without a video processor: the type is not offered.
        assert _create_video(client, owner).status_code == 415  # type: ignore[attr-defined]


def test_without_the_plugin_the_media_role_claims_only_voice_notes() -> None:
    from eimir.attachments import video_jobs

    with core_only():
        jobs = JobRegistry()
        loaded_plugins().register_jobs(jobs)
        jobs.register(ATTACHMENT_AUDIO_VALIDATION, video_jobs.validate_audio)
        # A queued video validation stays pending for a role with the plugin.
        assert video_worker.claimed_kinds(jobs) == [ATTACHMENT_AUDIO_VALIDATION]
        assert ATTACHMENT_VIDEO_VALIDATION in loaded_plugins().unclaimed_job_kinds(jobs)
    with with_pro_plugin():
        jobs = JobRegistry()
        loaded_plugins().register_jobs(jobs)
        assert video_worker.claimed_kinds(jobs) == [
            ATTACHMENT_VIDEO_VALIDATION,
            ATTACHMENT_AUDIO_VALIDATION,
        ]
