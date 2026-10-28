"""One private selection task feeds the existing attachment File ingress."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from datetime import timedelta
from typing import Literal
from uuid import UUID

from pydantic import SecretStr
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from eimir.api.deps import ensure_capability
from eimir.auth import rate_limit
from eimir.auth.tokens import hash_token, tokens_equal
from eimir.authorization import AuthorizationContext
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import (
    ConflictError,
    DomainError,
    ErrorCode,
    NotFoundError,
    RateLimitedError,
    ServiceUnavailableError,
)
from eimir.core.ids import new_id, parse_id
from eimir.db.locks import lock_subject
from eimir.entitlements.models import Capability
from eimir.identity.models import Account, DeviceSession
from eimir.jobs import queue
from eimir.photo_sources.browser_binding import valid_proof
from eimir.photo_sources.models import (
    PhotoConnection,
    PhotoConnectionPayload,
    PhotoSelection,
    PhotoSelectionPayload,
    SelectedPhotoItem,
)
from eimir.providers import google_photos
from eimir.providers.immich_photos import ImmichSelectedPhotoReader
from eimir.providers.photo_transport import PhotoSourceError, SelectedPhoto
from eimir.relationship.service import require_membership
from eimir.security.keyring import EncryptionMode

Provider = Literal["google", "immich"]
EXPIRE_JOB = "photo_selection_expire"
_SLOTS = threading.BoundedSemaphore(4)
_LIFETIME = timedelta(minutes=10)
_CAPABILITY = Capability.INTEGRATION_EXTERNAL_SYNC.value


def enabled() -> bool:
    settings = get_settings()
    return (
        settings.photo_sources_enabled
        and settings.encryption_mode is EncryptionMode.REQUIRED
        and settings.public_base_url.startswith("https://")
    )


def google_import_available() -> bool:
    # #1467: native browser handoff, device recovery and enablement acceptance
    # remain open. Operator credentials or flags cannot bypass this decision.
    return False


def _guard_google_import(provider: str) -> None:
    if provider == "google" and not google_import_available():
        raise ServiceUnavailableError(
            "This photo source is unavailable.", "PHOTO_SOURCE_UNAVAILABLE"
        )


def _guard(session: Session, auth: AuthorizationContext, *, lock: bool = True) -> None:
    if not enabled():
        raise ServiceUnavailableError(
            "This photo source is unavailable.", "PHOTO_SOURCE_UNAVAILABLE"
        )
    ensure_capability(session, auth.space_id, _CAPABILITY, lock_grants=lock)


@contextmanager
def transfer_slot() -> Iterator[None]:
    if not _SLOTS.acquire(blocking=False):
        raise RateLimitedError("Photo selection is busy. Try again.", "PHOTO_SOURCE_BUSY")
    try:
        yield
    except PhotoSourceError as error:
        raise ServiceUnavailableError(
            "The photo source could not complete this selection.", str(error)
        ) from None
    finally:
        _SLOTS.release()


def connection(session: Session, account_id: UUID) -> PhotoConnection | None:
    row = session.execute(
        select(PhotoConnection).where(
            PhotoConnection.account_id == account_id, PhotoConnection.provider == "immich"
        )
    ).scalar_one_or_none()
    if row and row.payload.account_id != account_id:
        raise ServiceUnavailableError(
            "Photo connection is unavailable.", "PHOTO_SOURCE_UNAVAILABLE"
        )
    return row


def connection_token(row: PhotoConnection | None, account_id: UUID) -> str:
    return f"{row.id}:{row.version}" if row else f"{account_id}:immich:absent"


def _check_connection_token(row: PhotoConnection | None, account_id: UUID, expected: str) -> None:
    if connection_token(row, account_id) != expected:
        raise ConflictError(
            "The photo connection changed since it was read.", ErrorCode.RESOURCE_VERSION_CONFLICT
        )


def connect_immich(
    session: Session, auth: AuthorizationContext, origin: str, api_key: SecretStr, expected: str
) -> None:
    _guard(session, auth)
    rate_limit.check(
        session,
        "photo-source-connect",
        str(auth.account_id),
        rate_limit.Limit(5, timedelta(minutes=15)),
    )
    # URL/key come only from this Account's explicit link action. The common
    # pinned transport still rejects LAN, metadata, redirects and DNS rebinding.
    with transfer_slot():
        reader = ImmichSelectedPhotoReader(origin, api_key)
        owner = reader.account_id()
    lock_subject(session, "photo-source-connection", str(auth.account_id))
    row = connection(session, auth.account_id)
    _check_connection_token(row, auth.account_id, expected)
    if row is None:
        row = PhotoConnection(account_id=auth.account_id, provider="immich")
        session.add(row)
    else:
        # Every explicit relink advances the token, even for identical credentials.
        row.version += 1
        # A changed credential/origin must invalidate every outstanding picker.
        session.execute(delete(PhotoSelection).where(PhotoSelection.connection_id == row.id))
    row.payload = PhotoConnectionPayload(
        account_id=auth.account_id,
        origin=origin,
        api_key=api_key.get_secret_value(),
        provider_account_id=owner,
    )
    session.flush()


def disconnect_immich(session: Session, auth: AuthorizationContext, expected: str) -> None:
    # Removing credentials is a privacy right and stays available after Pro expiry.
    lock_subject(session, "photo-source-connection", str(auth.account_id))
    row = connection(session, auth.account_id)
    _check_connection_token(row, auth.account_id, expected)
    if row:
        session.delete(row)
        session.flush()


def _reader(session: Session, row: PhotoSelection) -> tuple[ImmichSelectedPhotoReader, str]:
    linked = session.get(PhotoConnection, row.connection_id) if row.connection_id else None
    if (
        linked is None
        or linked.account_id != row.account_id
        or linked.payload.account_id != row.account_id
    ):
        raise NotFoundError("Photo connection not found.", "PHOTO_SOURCE_NOT_FOUND")
    data = linked.payload
    return ImmichSelectedPhotoReader(data.origin, SecretStr(data.api_key)), str(
        data.provider_account_id
    )


def start(
    session: Session,
    auth: AuthorizationContext,
    device: DeviceSession,
    provider: Provider,
    maximum: int,
    *,
    browser_binding: str | None = None,
) -> tuple[PhotoSelection, str | None]:
    _guard(session, auth)
    _guard_google_import(provider)
    if provider == "google" and not valid_proof(browser_binding):
        raise ServiceUnavailableError(
            "This photo source is unavailable.", "PHOTO_SOURCE_UNAVAILABLE"
        )
    rate_limit.check(
        session,
        "photo-source-start",
        str(auth.account_id),
        rate_limit.Limit(10, timedelta(minutes=15)),
    )
    lock_subject(session, "photo-source-start", str(auth.account_id))
    active = session.scalar(
        select(func.count())
        .select_from(PhotoSelection)
        .where(PhotoSelection.account_id == auth.account_id, PhotoSelection.expires_at > now())
    )
    if active and active >= 2:
        raise ConflictError(
            "Finish or cancel the existing photo selection.", "PHOTO_SOURCE_ALREADY_OPEN"
        )
    identifier = new_id()
    row = PhotoSelection(
        id=identifier,
        account_id=auth.account_id,
        space_id=auth.space_id,
        device_session_id=device.id,
        provider=provider,
        status="AUTHORIZING" if provider == "google" else "READY",
        expires_at=now() + _LIFETIME,
        next_poll_at=now(),
        payload=PhotoSelectionPayload(
            selection_id=identifier,
            account_id=auth.account_id,
            space_id=auth.space_id,
            device_session_id=device.id,
            max_items=maximum,
        ),
    )
    url: str | None = None
    with transfer_slot():
        if provider == "google":
            url, state, verifier = google_photos.authorization()
            row.state_hash = hash_token(state)
            row.payload = row.payload.model_copy(
                update={
                    "oauth_state": state,
                    "code_verifier": verifier,
                    "browser_binding_hash": hash_token(browser_binding or ""),
                }
            )
        else:
            linked = connection(session, auth.account_id)
            if linked is None:
                raise NotFoundError("Photo connection not found.", "PHOTO_SOURCE_NOT_FOUND")
            row.connection_id = linked.id
            _load_immich_page(session, row, 1)
    session.add(row)
    session.flush()
    queue.enqueue(session, EXPIRE_JOB, {"selection_id": str(row.id)}, delay=_LIFETIME)
    return row, url


def owned(
    session: Session,
    auth: AuthorizationContext,
    device: DeviceSession,
    identifier: str,
    *,
    commercial: bool = True,
    lock: bool = True,
) -> PhotoSelection:
    if commercial:
        _guard(session, auth, lock=lock)
    parsed = parse_id(identifier)
    statement = select(PhotoSelection).where(
        PhotoSelection.id == parsed,
        PhotoSelection.account_id == auth.account_id,
        PhotoSelection.space_id == auth.space_id,
        PhotoSelection.device_session_id == device.id,
        PhotoSelection.expires_at > now(),
    )
    if lock:
        statement = statement.with_for_update()
    row = session.execute(statement).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Photo selection not found.", "PHOTO_SOURCE_NOT_FOUND")
    data = row.payload
    if (data.selection_id, data.account_id, data.space_id, data.device_session_id) != (
        row.id,
        auth.account_id,
        auth.space_id,
        device.id,
    ):
        raise NotFoundError("Photo selection not found.", "PHOTO_SOURCE_NOT_FOUND")
    if commercial:
        _guard_google_import(row.provider)
    return row


def _load_immich_page(session: Session, row: PhotoSelection, page: int) -> None:
    reader, account_id = _reader(session, row)
    items, following = reader.list_photos(account_id, page)
    # Keep every issued local ID stable while a user chooses across pages.
    existing = {item.source_id: item for item in row.payload.items}
    for source_id, mime in items:
        existing.setdefault(
            source_id, SelectedPhotoItem(id=str(new_id()), source_id=source_id, mime_type=mime)
        )
    row.payload = row.payload.model_copy(
        update={"items": list(existing.values()), "next_page": following}
    )


def advance(session: Session, row: PhotoSelection, *, more: bool = False) -> None:
    _guard_google_import(row.provider)
    rate_limit.check(
        session,
        "photo-source-poll",
        str(row.account_id),
        rate_limit.Limit(240, timedelta(minutes=15)),
    )
    with transfer_slot():
        if row.provider == "immich":
            if more and row.payload.next_page:
                _load_immich_page(session, row, row.payload.next_page)
            return
        if row.status != "PICKING" or row.next_poll_at > now():
            return
        data = row.payload
        if not data.access_token or not data.provider_session_id:
            raise ConflictError("Photo selection is unavailable.", "PHOTO_SOURCE_SELECTION_INVALID")
        picker = google_photos.GooglePhotoPicker(data.access_token)
        state = picker.poll(data.provider_session_id)
        if state.get("mediaItemsSet") is True:
            items = picker.items(data.provider_session_id, data.max_items)
            row.payload = data.model_copy(
                update={
                    "items": [
                        SelectedPhotoItem(
                            id=str(new_id()), source_id=source_id, mime_type=mime, source_url=url
                        )
                        for source_id, mime, url in items
                    ]
                }
            )
            row.status = "READY"
        else:
            config = state.get("pollingConfig", {})
            interval = config.get("pollInterval", "5s") if isinstance(config, dict) else "5s"
            try:
                seconds = float(str(interval).removesuffix("s"))
            except ValueError:
                seconds = 5
            row.next_poll_at = now() + timedelta(seconds=min(60, max(3, seconds)))


def callback(
    session: Session,
    state: str,
    code: str | None,
    *,
    browser_binding: str | None = None,
) -> str | None:
    if not google_import_available() or not state or not valid_proof(browser_binding):
        return None
    # Discover only ownership metadata first. Match the existing lifecycle lock
    # order: Membership -> entitlement -> selection. Locking the selection
    # before Membership can deadlock with offboarding/account cleanup.
    metadata = session.execute(
        select(
            PhotoSelection.id,
            PhotoSelection.account_id,
            PhotoSelection.space_id,
            PhotoSelection.device_session_id,
        ).where(
            PhotoSelection.provider == "google",
            PhotoSelection.state_hash == hash_token(state),
            PhotoSelection.expires_at > now(),
            PhotoSelection.status == "AUTHORIZING",
        )
    ).first()
    if metadata is None or not enabled():
        return None
    account = session.get(Account, metadata.account_id)
    device = session.get(DeviceSession, metadata.device_session_id)
    if (
        not account
        or not account.is_active
        or not device
        or device.account_id != account.id
        or device.revoked_at
        or device.expires_at <= now()
        or device.absolute_expires_at <= now()
    ):
        return None
    try:
        require_membership(session, account, metadata.space_id)
        ensure_capability(session, metadata.space_id, _CAPABILITY)
    except DomainError:
        return None
    row = session.execute(
        select(PhotoSelection)
        .where(
            PhotoSelection.id == metadata.id,
            PhotoSelection.provider == "google",
            PhotoSelection.state_hash == hash_token(state),
            PhotoSelection.expires_at > now(),
            PhotoSelection.status == "AUTHORIZING",
        )
        .with_for_update()
    ).scalar_one_or_none()
    if row is None:
        return None
    data = row.payload
    # State and stored Account/DeviceSession metadata do not prove which
    # browser returned. A wrong browser must not exchange or consume the task.
    # Legacy rows have no proof and deliberately cannot complete authorization.
    if not data.browser_binding_hash or not tokens_equal(
        data.browser_binding_hash, hash_token(browser_binding or "")
    ):
        return None
    row.state_hash = None  # consumed even if the provider denies or fails
    try:
        if (
            data.account_id != row.account_id
            or data.space_id != row.space_id
            or data.device_session_id != row.device_session_id
            or data.selection_id != row.id
        ):
            raise PhotoSourceError("PHOTO_SOURCE_AUTHORIZATION_FAILED")
        if not code or not data.code_verifier or not data.oauth_state:
            raise PhotoSourceError("PHOTO_SOURCE_AUTHORIZATION_FAILED")
        with transfer_slot():
            token = google_photos.exchange(code, data.oauth_state, data.code_verifier)
            created = google_photos.GooglePhotoPicker(token).create(data.max_items)
            row.payload = data.model_copy(
                update={
                    "access_token": token,
                    "provider_session_id": created["id"],
                    "picker_uri": google_photos.picker_uri(created["pickerUri"]),
                    "oauth_state": None,
                    "code_verifier": None,
                    "browser_binding_hash": None,
                }
            )
            row.status = "PICKING"
            session.flush()
            return row.payload.picker_uri
    except (PhotoSourceError, DomainError):
        row.status = "FAILED"
        row.payload = data.model_copy(
            update={
                "oauth_state": None,
                "code_verifier": None,
                "browser_binding_hash": None,
                "access_token": None,
            }
        )
        session.flush()
        return None


def read_item(
    session: Session, row: PhotoSelection, item_id: str, *, thumbnail: bool
) -> SelectedPhoto:
    _guard_google_import(row.provider)
    rate_limit.check(
        session,
        "photo-source-read",
        str(row.account_id),
        rate_limit.Limit(360, timedelta(minutes=15)),
    )
    if row.status != "READY":
        raise ConflictError("Photo selection is not complete.", "PHOTO_SOURCE_SELECTION_INVALID")
    item = next((item for item in row.payload.items if item.id == item_id), None)
    if item is None:
        raise NotFoundError("Selected photo not found.", "PHOTO_SOURCE_NOT_FOUND")
    with transfer_slot():
        if row.provider == "immich":
            reader, owner = _reader(session, row)
            if thumbnail:
                return reader.thumbnail(item.source_id, owner)
            return reader.read_selected_photo(item.source_id, expected_owner=owner)
        data = row.payload
        if thumbnail or not data.access_token or not item.source_url:
            raise NotFoundError("Selected photo not found.", "PHOTO_SOURCE_NOT_FOUND")
        return google_photos.GooglePhotoPicker(data.access_token).read(
            item.source_url, item.mime_type
        )


def remove(session: Session, row: PhotoSelection) -> None:
    data = row.payload
    if row.provider == "google" and data.access_token and data.provider_session_id:
        # Local credential erasure does not depend on a reachable provider.
        with suppress(PhotoSourceError, ServiceUnavailableError, RateLimitedError), transfer_slot():
            google_photos.GooglePhotoPicker(data.access_token).delete(data.provider_session_id)
    session.delete(row)
    session.flush()


def expire(session: Session, payload: dict[str, object]) -> None:
    identifier = parse_id(str(payload.get("selection_id", "")))
    row = session.execute(
        select(PhotoSelection).where(PhotoSelection.id == identifier).with_for_update()
    ).scalar_one_or_none()
    if row:
        remove(session, row)
