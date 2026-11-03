"""Opaque video grants retain live session and canonical parent authorization."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.attachments import service
from eimir.attachments.models import Attachment, MediaType, PlaybackGrant
from eimir.auth import rate_limit, sessions
from eimir.auth.tokens import generate_token, hash_token
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import ValidationError
from eimir.identity.models import DeviceSession
from eimir.relationship.service import require_membership

LIFETIME = timedelta(minutes=5)
ISSUE_LIMIT = rate_limit.Limit(attempts=24, window=timedelta(minutes=5))


def issue(
    session: Session,
    context: AuthorizationContext,
    device_session: DeviceSession,
    attachment_id: str,
    parent_type: str,
    parent_id: UUID,
) -> tuple[str, datetime]:
    attachment = service.authorize_read(
        session, context, attachment_id, service.ReadTarget.parent(parent_type, parent_id)
    )
    if attachment.media_type != MediaType.VIDEO.value:
        raise ValidationError("Playback requires a video.", "VIDEO_REQUIRED")
    rate_limit.check(session, "video_playback", str(device_session.id), ISSUE_LIMIT)
    current = now()
    session.execute(
        delete(PlaybackGrant).where(
            PlaybackGrant.session_id == device_session.id, PlaybackGrant.expires_at <= current
        )
    )
    token = generate_token()
    expires = min(current + LIFETIME, device_session.expires_at, device_session.absolute_expires_at)
    session.add(
        PlaybackGrant(
            token_hash=hash_token(token),
            session_id=device_session.id,
            space_id=context.space_id,
            attachment_id=attachment.id,
            parent_type=parent_type,
            parent_id=parent_id,
            expires_at=expires,
        )
    )
    session.flush()
    return token, expires


def authorize(session: Session, *, token: str, space_id: UUID, attachment_id: UUID) -> Attachment:
    grant = session.execute(
        select(PlaybackGrant).where(
            PlaybackGrant.token_hash == hash_token(token),
            PlaybackGrant.space_id == space_id,
            PlaybackGrant.attachment_id == attachment_id,
            PlaybackGrant.expires_at > now(),
        )
    ).scalar_one_or_none()
    if grant is None:
        raise Attachment.privacy_absence.error()
    _, account = sessions.resolve_family(session, grant.session_id)
    require_membership(session, account, space_id)
    return service.authorize_read(
        session,
        AuthorizationContext(account_id=account.id, space_id=space_id),
        attachment_id,
        service.ReadTarget.parent(grant.parent_type, grant.parent_id),
    )
