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
from eimir.config import Environment, get_settings
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
from eimir.identity.models import Account, AccountEmail, DeviceSession
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
GOOGLE_RECOVERY_POLICY = "memory-only-v1"


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


def google_test_eligible(session: Session, account_id: UUID) -> bool:
    """Fail-closed test eligibility for the Google import (#1467).

    This never changes the production gate above. It is true only on an instance whose operator
    listed a verified address of this Account in ``EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS`` and
    whose photo-source, encryption, HTTPS and Google OAuth prerequisites hold. The entitlement and
    every ownership guard stay unchanged at the call sites.
    """
    settings = get_settings()
    listed = settings.google_photos_test_account_emails
    if (
        not listed
        or settings.demo_mode
        or settings.environment is Environment.DEMO
        or not enabled()
        or not (settings.google_photos_client_id or settings.google_photos_web_client_file)
    ):
        return False
    return (
        session.scalar(
            select(AccountEmail.id)
            .where(
                AccountEmail.account_id == account_id,
                AccountEmail.verified_at.is_not(None),
                AccountEmail.email.in_(listed),
            )
            .limit(1)
        )
        is not None
    )


def google_import_permitted(session: Session, account_id: UUID) -> bool:
    return google_import_available() or google_test_eligible(session, account_id)


def _guard_google_import(session: Session, account_id: UUID, provider: str) -> None:
    if provider == "google" and not google_import_permitted(session, account_id):
        raise ServiceUnavailableError(
            "This photo source is unavailable.", "PHOTO_SOURCE_UNAVAILABLE"
        )


def _guard_recovery_policy(row: PhotoSelection) -> None:
    if row.provider == "google" and row.payload.media_recovery_policy != GOOGLE_RECOVERY_POLICY:
        raise ServiceUnavailableError(
            "This photo source is unavailable.", "PHOTO_SOURCE_UNAVAILABLE"
        )


def _google_client(row: PhotoSelection) -> google_photos.GooglePhotosClient:
    with transfer_slot():
        client = google_photos.client_configuration()
    if not row.payload.google_client_binding or not tokens_equal(
        row.payload.google_client_binding, client.binding
    ):
        raise ServiceUnavailableError(
            "This photo source configuration changed. Start a new selection.",
            "PHOTO_SOURCE_CONFIGURATION_CHANGED",
        )
    return client


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
    media_recovery_policy: str | None = None,
) -> tuple[PhotoSelection, str | None]:
    _guard(session, auth)
    _guard_google_import(session, auth.account_id, provider)
    if provider == "google" and (
        not valid_proof(browser_binding) or media_recovery_policy != GOOGLE_RECOVERY_POLICY
    ):
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
            media_recovery_policy=media_recovery_policy if provider == "google" else None,
        ),
    )
    url: str | None = None
    with transfer_slot():
        if provider == "google":
            client = google_photos.client_configuration()
            url, state, verifier = google_photos.authorization(client=client)
            row.state_hash = hash_token(state)
            row.payload = row.payload.model_copy(
                update={
                    "oauth_state": state,
                    "code_verifier": verifier,
                    "browser_binding_hash": hash_token(browser_binding or ""),
                    "google_client_binding": client.binding,
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
        _guard_google_import(session, auth.account_id, row.provider)
        _guard_recovery_policy(row)
        if row.provider == "google":
            _google_client(row)
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
    _guard_google_import(session, row.account_id, row.provider)
    _guard_recovery_policy(row)
    if row.provider == "google":
        _google_client(row)
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
        if (
            row.status == "PICKING"
            and row.payload.google_poll_deadline is not None
            and row.payload.google_poll_deadline <= now()
        ):
            _finish_expired_google(session, row)
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
            timing = google_photos.session_timing(
                state,
                at=now(),
                expires_at=row.expires_at,
                poll_deadline=data.google_poll_deadline,
            )
            previous_deadline = min(data.google_poll_deadline or row.expires_at, row.expires_at)
            row.expires_at = timing.expires_at
            row.payload = data.model_copy(update={"google_poll_deadline": timing.poll_deadline})
            if timing.poll_deadline <= now():
                _finish_expired_google(session, row)
                return
            row.next_poll_at = min(now() + timing.interval, timing.poll_deadline)
            if timing.poll_deadline < previous_deadline:
                queue.enqueue(
                    session,
                    EXPIRE_JOB,
                    {"selection_id": str(row.id), "polling_timeout": True},
                    delay=timing.poll_deadline - now(),
                )


def _finish_expired_google(session: Session, row: PhotoSelection) -> None:
    data = row.payload
    # Called inside the existing bounded transfer slot. Remote cleanup must not
    # prevent immediate local credential erasure on a timeout.
    if data.access_token and data.provider_session_id:
        with suppress(PhotoSourceError):
            google_photos.GooglePhotoPicker(data.access_token).delete(data.provider_session_id)
    row.status = "EXPIRED"
    row.payload = data.model_copy(
        update={"access_token": None, "provider_session_id": None, "picker_uri": None}
    )
    session.flush()


def callback(
    session: Session,
    state: str,
    code: str | None,
    *,
    browser_binding: str | None = None,
) -> str | None:
    # Cheap configuration-only precheck: with the production gate closed and no test list
    # configured, nothing below may touch the database or the provider.
    if (
        not (google_import_available() or get_settings().google_photos_test_account_emails)
        or not state
        or not valid_proof(browser_binding)
    ):
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
    if (
        metadata is None
        or not enabled()
        or not google_import_permitted(session, metadata.account_id)
    ):
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
    if (
        data.media_recovery_policy != GOOGLE_RECOVERY_POLICY
        or not data.browser_binding_hash
        or not tokens_equal(data.browser_binding_hash, hash_token(browser_binding or ""))
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
        client = _google_client(row)
        with transfer_slot():
            token = google_photos.exchange(
                code, data.oauth_state, data.code_verifier, client=client
            )
            created = google_photos.GooglePhotoPicker(token).create(data.max_items)
            # Persist the new session before validating its deadlines so failure
            # cleanup can delete it using the token that created it.
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
            timing = google_photos.session_timing(created, at=now(), expires_at=row.expires_at)
            row.expires_at = timing.expires_at
            row.next_poll_at = min(now() + timing.interval, timing.poll_deadline)
            row.payload = row.payload.model_copy(
                update={"google_poll_deadline": timing.poll_deadline}
            )
            if timing.poll_deadline <= now():
                _finish_expired_google(session, row)
                return None
            queue.enqueue(
                session,
                EXPIRE_JOB,
                {"selection_id": str(row.id), "polling_timeout": True},
                delay=max(timedelta(), timing.poll_deadline - now()),
            )
            session.flush()
            return row.payload.picker_uri
    except (PhotoSourceError, DomainError):
        if row.payload.access_token and row.payload.provider_session_id:
            with suppress(PhotoSourceError, DomainError), transfer_slot():
                google_photos.GooglePhotoPicker(row.payload.access_token).delete(
                    row.payload.provider_session_id
                )
        row.status = "FAILED"
        row.payload = data.model_copy(
            update={
                "oauth_state": None,
                "code_verifier": None,
                "browser_binding_hash": None,
                "access_token": None,
                "provider_session_id": None,
                "picker_uri": None,
            }
        )
        session.flush()
        return None


def read_item(
    session: Session, row: PhotoSelection, item_id: str, *, thumbnail: bool
) -> SelectedPhoto:
    _guard_google_import(session, row.account_id, row.provider)
    _guard_recovery_policy(row)
    if row.provider == "google":
        _google_client(row)
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
        deadline = row.payload.google_poll_deadline
        if (
            payload.get("polling_timeout") is not True
            or row.expires_at <= now()
            or (row.status == "PICKING" and deadline is not None and deadline <= now())
        ):
            remove(session, row)
