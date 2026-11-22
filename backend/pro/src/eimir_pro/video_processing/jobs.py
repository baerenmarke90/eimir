"""The Pro video validation job (``media.video_upload``, Decision 0017).

The plugin registers it with the Core media pipeline and its own processor. A
worker without the plugin leaves queued video validations unclaimed (the kind is
in ``PLUGIN_JOB_KINDS``); they run as soon as a worker with the plugin is back.
Restoring an imported video is not paywalled, so this job checks no capability.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from eimir.attachments import video_jobs
from eimir.attachments.models import MediaType
from eimir.attachments.service import ATTACHMENT_VIDEO_VALIDATION
from eimir_pro.video_processing import videos

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from eimir.jobs.worker import JobRegistry


def validate_video(source: Session, payload: dict[str, Any]) -> None:
    video_jobs.validate(source, payload, media_type=MediaType.VIDEO, process=videos.process)


def register_handlers(registry: JobRegistry) -> None:
    if registry.get(ATTACHMENT_VIDEO_VALIDATION) is None:
        registry.register(ATTACHMENT_VIDEO_VALIDATION, validate_video)
