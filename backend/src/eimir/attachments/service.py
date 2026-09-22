"""Attachment lifecycle.

A successful provider upload is not ``READY``. Server-side validation sits
between transfer and readiness and is the only authority that may advance the
state; that is why validation runs as a background job rather than in the
request path.

The M2-D05 state machine is authoritative here. Every transition validates its
source state so a call made at the wrong time changes nothing instead of
performing half a transition.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import BinaryIO
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.attachments import images
from eimir.attachments.limits import MediaRule, rule_for
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import (
    AuthorizationContext,
    PrivacyClass,
    require_readable,
    require_writable,
)
from eimir.core.clock import now
from eimir.core.errors import (
    ConflictError,
    ErrorCode,
    NotFoundError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
    ValidationError,
)
from eimir.core.ids import parse_id
from eimir.jobs import queue
from eimir.media import (
    build_account_storage_key,
    build_storage_key,
    get_media_store,
    supports_signed_upload,
)
from eimir.security.errors import PlaintextRejectedError

log = logging.getLogger(__name__)

ATTACHMENT_VALIDATION = "attachment_validation"

BINDING_WINDOW = timedelta(minutes=60)
"""M2-D20: maximum time a READY attachment may remain unbound."""

ORIGINAL_VARIANT = "original"
THUMBNAIL_VARIANT = "thumbnail"

MAX_ORIGINAL_NAME = 255


@dataclass(frozen=True)
class ReadTarget:
    """What the caller asserts about attachment binding, or no assertion.

    Three cases must remain distinct. ``NONE`` in the API contract is a client
    assertion that an attachment is unbound and is invalid for a bound
    attachment under M2-D24. The internal streaming route makes no assertion
    and lets the server resolve the actual parent.

    Collapsing both cases into ``parent_type is None`` would either discard the
    API assertion or prevent the streaming path from serving bound content.
    """

    parent_type: str | None = None
    parent_id: UUID | None = None
    asserts_unbound: bool = False

    @classmethod
    def resolved_by_server(cls) -> ReadTarget:
        """Make no assertion; let the server resolve the actual binding."""
        return cls()

    @classmethod
    def unbound(cls) -> ReadTarget:
        """Assert that the attachment is currently unbound."""
        return cls(asserts_unbound=True)

    @classmethod
    def parent(cls, parent_type: str, parent_id: UUID) -> ReadTarget:
        return cls(parent_type=parent_type, parent_id=parent_id)


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _not_ready() -> ConflictError:
    return ConflictError(
        "The attachment is not ready.",
        ErrorCode.ATTACHMENT_NOT_READY,
    )


def storage_key_for(attachment: Attachment, variant: str = ORIGINAL_VARIANT) -> str:
    """Return the key of the storage home this attachment currently occupies.

    A Space-owned attachment lives under its Space prefix. Account-owned media
    has no Space and lives under its owner's prefix; ``attachments.account_media``
    is the only code that moves a row between the two.
    """
    if attachment.space_id is None:
        return build_account_storage_key(attachment.owner_id, attachment.id, variant)
    return build_storage_key(attachment.space_id, attachment.id, variant)


def storage_homes_for(attachment: Attachment, variant: str = ORIGINAL_VARIANT) -> list[str]:
    """Return every key this attachment may ever have occupied.

    One row has at most two possible homes across its life: the Space it was
    uploaded into, and the Account that adopted it as profile media. Adoption
    copies before it commits, so a transaction that rolls back after the copy
    can leave bytes at the Account home of a row that is still Space-owned.
    Purging both homes keeps that impossible to leak instead of relying on the
    adoption path never being interrupted.
    """
    keys = [build_account_storage_key(attachment.owner_id, attachment.id, variant)]
    if attachment.space_id is not None:
        keys.insert(0, build_storage_key(attachment.space_id, attachment.id, variant))
    return keys


def _require_rule(mime_type: str, media_type: MediaType) -> MediaRule:
    rule = rule_for(mime_type)
    if rule is None or rule.media_type is not media_type:
        raise UnsupportedMediaTypeError(
            "This media type is not accepted.",
            ErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED,
        )
    if not rule.supported:
        # M2-D23: the contract permits the type while this release does not
        # implement it. Reject fail-closed using the same code as an unknown
        # type because the distinction is not useful to the client.
        raise UnsupportedMediaTypeError(
            "This media type is not accepted.",
            ErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED,
        )
    return rule


def create_upload(
    session: Session,
    context: AuthorizationContext,
    *,
    media_type: MediaType,
    original_name: str,
    expected_mime_type: str,
    expected_size: int,
) -> Attachment:
    """Register an upload.

    This check validates client declarations only and never replaces later
    validation of the actual object. It merely avoids transferring an upload
    that is already known to be impossible.
    """
    rule = _require_rule(expected_mime_type, media_type)

    name = original_name.strip()
    if not name or len(name) > MAX_ORIGINAL_NAME:
        raise ValidationError("An original name is required.", "ATTACHMENT_NAME_REQUIRED")
    if expected_size <= 0:
        raise ValidationError("An expected size is required.", "ATTACHMENT_SIZE_REQUIRED")
    if expected_size > rule.max_size:
        raise PayloadTooLargeError(
            "The attachment exceeds the size limit.",
            ErrorCode.ATTACHMENT_TOO_LARGE,
        )

    attachment = Attachment(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.PENDING.value,
        media_type=media_type.value,
        declared_mime_type=rule.mime_type,
        declared_size=expected_size,
        payload=AttachmentPayload(original_name=name),
    )
    session.add(attachment)
    _flush(session)
    return attachment


def open_upload(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
) -> tuple[Attachment, MediaRule]:
    """Authorize and open an upload target before accepting the first byte.

    Authorization precedes reading the body. Reversing that order would let an
    arbitrary sender decide how much data the server receives before permission
    is established.

    Re-uploading the same PENDING/UPLOADING attachment is allowed and
    overwrites the object so an interrupted transfer does not require a new
    attachment row.
    """
    attachment = require_writable(session, Attachment, context, attachment_id)
    if attachment.status not in (
        AttachmentStatus.PENDING.value,
        AttachmentStatus.UPLOADING.value,
    ):
        raise ConflictError(
            "The upload target is not open.",
            ErrorCode.ATTACHMENT_NOT_READY,
        )
    rule = _require_rule(attachment.declared_mime_type, MediaType(attachment.media_type))
    return attachment, rule


def too_large() -> PayloadTooLargeError:
    return PayloadTooLargeError(
        "The attachment exceeds the size limit.",
        ErrorCode.ATTACHMENT_TOO_LARGE,
    )


def complete_upload(
    session: Session,
    attachment: Attachment,
    rule: MediaRule,
    data: bytes,
) -> Attachment:
    """Store accepted upload bytes.

    The size limit is already applied while reading; it is checked again here
    so another caller cannot bypass the request-layer boundary.
    """
    if len(data) > rule.max_size:
        raise too_large()
    get_media_store().put(storage_key_for(attachment), io.BytesIO(data), rule.mime_type)
    attachment.status = AttachmentStatus.UPLOADING.value
    attachment.uploaded_at = now()
    _flush(session)
    return attachment


def finalize_upload(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
) -> Attachment:
    """Accept an upload for validation idempotently.

    Two concurrent calls must enqueue exactly one validation run. The row is
    locked before state inspection so the second caller observes VALIDATING and
    does not enqueue a duplicate job.

    With presigned transport the API does not observe byte transfer directly.
    Under the same row lock, PENDING becomes UPLOADING only after the adapter
    confirms the precisely bound provider object. This records transfer only;
    the worker remains the sole authority for validation.
    """
    attachment = require_writable(session, Attachment, context, attachment_id)
    locked = session.execute(
        select(Attachment).where(Attachment.id == attachment.id).with_for_update()
    ).scalar_one()

    if locked.status == AttachmentStatus.VALIDATING.value:
        return locked

    store = get_media_store()
    if locked.status == AttachmentStatus.PENDING.value and supports_signed_upload(store):
        if not store.exists(storage_key_for(locked)):
            raise ConflictError(
                "The upload has not been transferred.",
                ErrorCode.ATTACHMENT_NOT_READY,
            )
        locked.status = AttachmentStatus.UPLOADING.value
        locked.uploaded_at = now()

    if locked.status != AttachmentStatus.UPLOADING.value:
        raise ConflictError(
            "The upload has not been transferred.",
            ErrorCode.ATTACHMENT_NOT_READY,
        )

    locked.status = AttachmentStatus.VALIDATING.value
    queue.enqueue(session, ATTACHMENT_VALIDATION, {"attachmentId": str(locked.id)})
    _flush(session)
    return locked


def _load_in_space(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
) -> Attachment:
    """Find the row in the caller's space without applying attachment class.

    Attachment is the one M2 resource whose readability does not follow only
    from its own privacy class: after binding, the parent decides (Media
    Pipeline, section 8). Applying the OWNER_ONLY guard here would prevent a
    partner from seeing the image of a shared memory.

    This is not a second visibility rule. The decision is deferred rather than
    duplicated; ``authorize_read`` applies central authorization to the parent.
    """
    identifier = attachment_id if isinstance(attachment_id, UUID) else parse_id(attachment_id)
    if identifier is None:
        raise Attachment.privacy_absence.error()
    found = session.execute(
        select(Attachment).where(
            Attachment.id == identifier,
            Attachment.space_id == context.space_id,
        )
    ).scalar_one_or_none()
    if found is None:
        raise Attachment.privacy_absence.error()
    if found.status in (
        AttachmentStatus.DELETING.value,
        AttachmentStatus.DELETE_FAILED.value,
    ):
        # Domain-visible deletion is immediate under M2-D11. Physical provider
        # cleanup still being in progress must not leak row existence.
        raise Attachment.privacy_absence.error()
    return found


def get_attachment(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
) -> Attachment:
    """Read metadata under the same two-stage rule as attachment content.

    A bound attachment is readable by anyone who may read its parent. An
    unbound attachment is readable only by its owner during the binding window.
    Applying a weaker rule here would make the metadata endpoint a bypass.
    """
    from eimir.attachments import binding

    attachment = _load_in_space(session, context, attachment_id)
    actual_parent = binding.parent_of(session, attachment.id)
    if actual_parent is None:
        if attachment.owner_id != context.account_id:
            raise Attachment.privacy_absence.error()
        return attachment
    _require_readable_parent(session, context, *actual_parent)
    return attachment


def authorize_read(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
    target: ReadTarget,
) -> Attachment:
    """Authorize attachment content at the time it is read.

    After binding, readability follows only the parent. Attachment ownership is
    not an alternate path: a caller who cannot read a memory anymore, or whose
    partner made a heart moment private, cannot retrieve its image through the
    attachment route.

    A client-supplied parent is not a capability token. It is checked against
    the actual relation rather than trusted.
    """
    from eimir.attachments import binding

    attachment = _load_in_space(session, context, attachment_id)
    if attachment.status != AttachmentStatus.READY.value:
        raise _not_ready()

    actual_parent = binding.parent_of(session, attachment.id)

    if actual_parent is None:
        # Unbound: owner only and only during the binding window (M2-D20/D24).
        if target.parent_type is not None:
            raise Attachment.privacy_absence.error()
        if attachment.owner_id != context.account_id:
            raise Attachment.privacy_absence.error()
        if binding_window_expired(attachment):
            raise Attachment.privacy_absence.error()
        return attachment

    if target.asserts_unbound:
        # M2-D24 applies only to truly unbound uploads. Reject a false assertion
        # instead of silently correcting it.
        raise Attachment.privacy_absence.error()

    parent_type, parent_id = actual_parent
    if target.parent_type is not None and (
        target.parent_type != parent_type or target.parent_id != parent_id
    ):
        # Reject rather than correct a false parent assertion; otherwise this
        # endpoint would become a guessing oracle with feedback.
        raise Attachment.privacy_absence.error()

    _require_readable_parent(session, context, parent_type, parent_id)
    return attachment


def _require_readable_parent(
    session: Session,
    context: AuthorizationContext,
    parent_type: str,
    parent_id: UUID,
) -> None:
    """Let the parent decide through the same central authorization layer.

    No visibility predicate is restated here. A second rule could diverge from
    the domain rule and turn attachment reads into a bypass.
    """
    from eimir.heart_moments.models import HeartMoment
    from eimir.memories.models import Memory
    from eimir.people.models import RelatedPerson

    if parent_type == "MEMORY":
        model: type[Memory] | type[HeartMoment] | type[RelatedPerson] = Memory
    elif parent_type == "HEART_MOMENT":
        model = HeartMoment
    elif parent_type == "RELATED_PERSON":
        model = RelatedPerson
    else:
        raise Attachment.privacy_absence.error()
    try:
        require_readable(session, model, context, parent_id)
    except NotFoundError as error:
        raise Attachment.privacy_absence.error() from error


def binding_window_expired(attachment: Attachment) -> bool:
    if attachment.ready_at is None:
        return True
    ready_at = attachment.ready_at
    if ready_at.tzinfo is None:
        ready_at = ready_at.replace(tzinfo=UTC)
    return now() - ready_at > BINDING_WINDOW


def open_content(attachment: Attachment, *, variant: str = ORIGINAL_VARIANT) -> BinaryIO:
    return get_media_store().open(storage_key_for(attachment, variant))


def delete_attachment(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    """Make the attachment immediately invisible and clean up provider data asynchronously."""
    attachment = require_writable(session, Attachment, context, attachment_id)
    if attachment.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )
    mark_for_deletion(session, attachment)
    _flush(session)


def mark_for_deletion(session: Session, attachment: Attachment) -> None:
    attachment.status = AttachmentStatus.DELETING.value


def purge(session: Session, attachment: Attachment) -> bool:
    """Remove provider objects and row, returning whether cleanup succeeded.

    Storage failure must not reverse domain-visible deletion. On failure the row
    remains DELETE_FAILED for retry and never becomes visible again.
    """
    store = get_media_store()
    variants = [ORIGINAL_VARIANT]
    if attachment.has_thumbnail:
        variants.append(THUMBNAIL_VARIANT)
    try:
        for variant in variants:
            for storage_key in storage_homes_for(attachment, variant):
                store.delete(storage_key)
    except OSError:
        attachment.status = AttachmentStatus.DELETE_FAILED.value
        log.warning("attachment purge failed", extra={"attachmentId": str(attachment.id)})
        return False
    session.delete(attachment)
    return True


def _fail(attachment: Attachment, code: str) -> None:
    attachment.status = AttachmentStatus.FAILED.value
    attachment.failure_code = code
    attachment.failed_at = now()


def validate(session: Session, attachment_id: UUID) -> None:
    """Run attachment validation in the worker, never in a request path.

    Media Pipeline section 7 ordering is preserved: validate first, store the
    M2-D14 sanitized form, and only then enter ``READY``. M2-D15 thumbnail
    generation happens outside the security-critical chain; its failure affects
    presentation only.
    """
    attachment = session.get(Attachment, attachment_id, with_for_update=True)
    if attachment is None or attachment.status != AttachmentStatus.VALIDATING.value:
        # Cancelled, deleted, or already processed. This is not an error.
        return

    rule = rule_for(attachment.declared_mime_type)
    if rule is None or not rule.supported:
        _fail(attachment, ErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED)
        return

    store = get_media_store()
    storage_key = storage_key_for(attachment)
    if not store.exists(storage_key):
        _fail(attachment, ErrorCode.ATTACHMENT_VALIDATION_FAILED)
        return

    try:
        with store.open(storage_key) as source:
            raw = source.read()
    except PlaintextRejectedError:
        # A client that received a presigned upload URL before encryption became
        # mandatory can still complete it, leaving plaintext at the provider.
        # That object is never accepted: remove it and fail the attachment.
        store.delete(storage_key)
        _fail(attachment, ErrorCode.ATTACHMENT_VALIDATION_FAILED)
        return

    if len(raw) > rule.max_size:
        _fail(attachment, ErrorCode.ATTACHMENT_TOO_LARGE)
        return

    try:
        processed = images.process(raw, rule)
    except images.ImageRejectedError as error:
        _fail(attachment, error.code)
        return

    store.put(storage_key, io.BytesIO(processed.content), processed.mime_type)

    attachment.mime_type = processed.mime_type
    attachment.size = len(processed.content)
    attachment.width = processed.width
    attachment.height = processed.height
    attachment.payload = AttachmentPayload(
        original_name=attachment.payload.original_name,
        captured_at=processed.captured_at,
        orientation=processed.orientation,
    )

    if processed.thumbnail is not None:
        try:
            store.put(
                storage_key_for(attachment, THUMBNAIL_VARIANT),
                io.BytesIO(processed.thumbnail),
                "image/jpeg",
            )
        except OSError:
            log.warning("thumbnail store failed", extra={"attachmentId": str(attachment.id)})
        else:
            attachment.has_thumbnail = True

    attachment.status = AttachmentStatus.READY.value
    attachment.ready_at = now()
    attachment.failure_code = None


def expired(reference: datetime | None, retention: timedelta) -> bool:
    if reference is None:
        return False
    instant = reference if reference.tzinfo is not None else reference.replace(tzinfo=UTC)
    return now() - instant > retention
