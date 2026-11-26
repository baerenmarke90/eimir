"""Cloud storage quota per Space (#2141).

The quota limits the bytes a Space keeps in managed storage. It is a Cloud
operating rule, so it lives in Core and holds without the Pro plugin: it also
bounds Free uploads of photos, audio and PDFs. Self-Hosted is unmetered.

What counts is every Space attachment at its actual size. A finished file
counts with the size the server established; a file that is still being
uploaded or validated counts with its declared size, which reserves room for
it. Not counted are files that failed or that the couple deleted (their bytes
leave with cleanup), Account media such as the profile photo (it has no Space),
thumbnails, encryption overhead, one-time partner messages (a separate,
short-lived store with its own limit) and Transfer archives (removed after a
day).

The usage is a computed sum rather than a maintained counter, so deletion,
failures, expiry and restore can never make it drift. A caller that decides on
it and then writes new bytes serializes on the Space first (``lock=True``), so
two writes that each fit cannot together exceed the quota.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.config import Deployment, Settings, get_settings
from eimir.core.errors import ErrorCode, PayloadTooLargeError
from eimir.db.locks import lock_subject
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability

COUNTED_STATUSES = (
    AttachmentStatus.PENDING.value,
    AttachmentStatus.UPLOADING.value,
    AttachmentStatus.VALIDATING.value,
    AttachmentStatus.READY.value,
)
_LOCK_SUBJECT = "space-storage-quota"


@dataclass(frozen=True)
class SpaceStorage:
    """A Space's counted bytes and the quota that applies to it."""

    used: int
    quota: int | None
    """``None`` means unmetered: Self-Hosted, or a tier without a set value."""

    @property
    def available(self) -> int | None:
        """Bytes that still fit, never negative, or ``None`` when unmetered."""
        if self.quota is None:
            return None
        return max(self.quota - self.used, 0)

    def fits(self, additional: int) -> bool:
        """Whether ``additional`` new bytes fit, the limit itself included."""
        return self.quota is None or self.used + additional <= self.quota


class StorageQuotaExceededError(PayloadTooLargeError):
    """New bytes would take the Space past its Cloud storage quota.

    Nothing has been written when it is raised: existing content stays as it
    is, and the member can free space or get Premium and try again.
    """


def require_fit(storage: SpaceStorage, needed: int, *, without_videos: int | None = None) -> None:
    """Refuse ``needed`` new bytes that do not fit.

    ``without_videos`` is what the same write would need without its videos.
    When that would fit, the refusal says so, so the member can choose it.
    """
    if storage.fits(needed):
        return
    if without_videos is not None and without_videos < needed and storage.fits(without_videos):
        raise StorageQuotaExceededError(
            "The Space's storage is full; this fits without its videos.",
            ErrorCode.STORAGE_QUOTA_EXCEEDED_FITS_WITHOUT_VIDEOS,
        )
    raise StorageQuotaExceededError(
        "The Space's storage is full. Free up space or get Premium.",
        ErrorCode.STORAGE_QUOTA_EXCEEDED,
    )


def space_usage(session: Session, space_id: UUID) -> int:
    """Return the bytes the Space currently keeps, as defined above."""
    counted = func.coalesce(Attachment.size, Attachment.declared_size)
    total = session.scalar(
        select(func.coalesce(func.sum(counted), 0)).where(
            Attachment.space_id == space_id,
            Attachment.status.in_(COUNTED_STATUSES),
        )
    )
    return int(total or 0)


def space_quota(
    session: Session, space_id: UUID, *, settings: Settings | None = None
) -> int | None:
    """Return the quota for the Space, or ``None`` when it is unmetered.

    Only Cloud meters storage. There the Space's ``storage.cloud_quota_50gb``
    capability selects the Premium value; otherwise the Free value applies.
    The capability is never effective on Self-Hosted.
    """
    settings = settings or get_settings()
    if settings.deployment is not Deployment.CLOUD:
        return None
    premium = entitlements.has_capability(
        session,
        space_id,
        Capability.STORAGE_CLOUD_QUOTA_50GB,
        deployment=settings.deployment,
    )
    return settings.storage_quota_premium_bytes if premium else settings.storage_quota_free_bytes


def spaces_near_quota(
    session: Session,
    *,
    ratio: float,
    limit: int,
    settings: Settings | None = None,
) -> tuple[int, list[tuple[UUID, int, int]]]:
    """Return the Spaces at or above ``ratio`` of their Cloud quota.

    The result is the total number of such Spaces and at most ``limit`` of
    them as ``(space_id, used, quota)``, fullest first. Self-Hosted and an
    unmetered configuration have none. Counts and ids only: the ServerAdmin
    Situation uses it to say that a Space is close to full, nothing about it.
    """
    settings = settings or get_settings()
    if settings.deployment is not Deployment.CLOUD:
        return 0, []
    quotas = [
        value
        for value in (settings.storage_quota_free_bytes, settings.storage_quota_premium_bytes)
        if value is not None
    ]
    if not quotas:
        return 0, []
    counted = func.coalesce(Attachment.size, Attachment.declared_size)
    used = func.sum(counted)
    # The lowest quota any Space can have bounds the candidates; each one is
    # then measured against its own quota.
    candidates = session.execute(
        select(Attachment.space_id, used)
        .where(
            Attachment.space_id.is_not(None),
            Attachment.status.in_(COUNTED_STATUSES),
        )
        .group_by(Attachment.space_id)
        .having(used >= ratio * min(quotas))
    ).all()
    near: list[tuple[UUID, int, int]] = []
    for space_id, total in candidates:
        quota = space_quota(session, space_id, settings=settings)
        if quota is not None and int(total) >= ratio * quota:
            near.append((space_id, int(total), quota))
    near.sort(key=lambda item: item[1] / item[2], reverse=True)
    return len(near), near[:limit]


def space_storage(
    session: Session,
    space_id: UUID,
    *,
    lock: bool = False,
    settings: Settings | None = None,
) -> SpaceStorage:
    """Measure the Space against its quota.

    With ``lock`` the Space is serialized until the transaction ends, before
    anything is read, so a caller can decide and write without a race.
    """
    if lock:
        lock_subject(session, _LOCK_SUBJECT, str(space_id))
    return SpaceStorage(
        used=space_usage(session, space_id),
        quota=space_quota(session, space_id, settings=settings),
    )
