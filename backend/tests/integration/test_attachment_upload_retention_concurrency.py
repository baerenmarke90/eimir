"""Deterministic upload/retention races for #713."""

from __future__ import annotations

import io
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta
from threading import Event, Lock
from typing import BinaryIO
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.api.v1 import attachments as attachment_api
from eimir.attachments import cleanup, service, upload_ownership
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import DomainError
from eimir.media import (
    ByteSource,
    MediaStore,
    SignedUpload,
    StoredObject,
    build_storage_key,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


class ControlledStore(MediaStore):
    """Provider fake whose mutation boundaries can be held by Events."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self._lock = Lock()
        self.put_calls = 0
        self.delete_calls = 0

        self.put_started = Event()
        self.allow_put = Event()
        self.allow_put.set()

        self.delete_started = Event()
        self.allow_delete = Event()
        self.allow_delete.set()

        self.exists_started = Event()
        self.allow_exists = Event()
        self.allow_exists.set()

    def put(
        self,
        storage_key: str,
        data: ByteSource,
        content_type: str,
    ) -> StoredObject:
        payload = data.read()
        with self._lock:
            self.put_calls += 1
        self.put_started.set()
        assert self.allow_put.wait(timeout=5), "test did not release provider put"
        with self._lock:
            self.objects[storage_key] = payload
        return StoredObject(storage_key=storage_key, size=len(payload), content_type=content_type)

    def open(self, storage_key: str) -> BinaryIO:
        with self._lock:
            payload = self.objects[storage_key]
        return io.BytesIO(payload)

    def delete(self, storage_key: str) -> None:
        with self._lock:
            self.delete_calls += 1
        self.delete_started.set()
        assert self.allow_delete.wait(timeout=5), "test did not release provider delete"
        with self._lock:
            self.objects.pop(storage_key, None)

    def exists(self, storage_key: str) -> bool:
        self.exists_started.set()
        assert self.allow_exists.wait(timeout=5), "test did not release provider exists"
        with self._lock:
            return storage_key in self.objects

    def create_read_url(self, storage_key: str, expires_in: timedelta) -> str | None:
        del storage_key, expires_in
        return None

    def create_upload_url(
        self,
        storage_key: str,
        content_type: str,
        expires_in: timedelta,
    ) -> SignedUpload:
        del content_type, expires_in
        return SignedUpload(url=f"https://upload.invalid/{storage_key}", required_headers={})


@dataclass(frozen=True)
class UploadSetup:
    context: AuthorizationContext
    attachment_id: UUID
    storage_key: str


def _stale_upload(
    maker,  # type: ignore[no-untyped-def]
    *,
    status: AttachmentStatus = AttachmentStatus.PENDING,
) -> UploadSetup:
    stale_at = now() - cleanup.UPLOAD_RETENTION - timedelta(minutes=1)
    with maker() as session:
        account = make_account(session, "Upload owner")
        space = make_space(session, account)
        context = AuthorizationContext(account_id=account.id, space_id=space.id)
        attachment = service.create_upload(
            session,
            context,
            media_type=MediaType.IMAGE,
            original_name="race.jpg",
            expected_mime_type="image/jpeg",
            expected_size=3,
        )
        attachment.created_at = stale_at
        if status is AttachmentStatus.UPLOADING:
            attachment.status = AttachmentStatus.UPLOADING.value
            attachment.uploaded_at = stale_at
        attachment_id = attachment.id
        storage_key = build_storage_key(space.id, attachment.id)
        session.commit()
    return UploadSetup(context=context, attachment_id=attachment_id, storage_key=storage_key)


def _expire_and_purge(maker) -> tuple[int, int, int]:  # type: ignore[no-untyped-def]
    with maker() as session:
        expired = cleanup._expire_stale_uploads(session)
        session.flush()
        removed, failed = cleanup._purge_marked(session)
        session.commit()
        return expired, removed, failed


def test_upload_claim_and_provider_write_win_over_cleanup(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """A: active claim is visible; provider write also owns the row."""
    _, maker = production_client
    setup = _stale_upload(maker)
    store = ControlledStore()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    with maker() as source:
        claim = upload_ownership.claim_upload(source, setup.context, setup.attachment_id)

    # The old retention timestamp remains old, but the committed lease makes
    # current activity authoritative across processes.
    with maker() as cleanup_session:
        assert cleanup._expire_stale_uploads(cleanup_session) == 0
        cleanup_session.commit()

    store.allow_put.clear()

    def finish_upload() -> None:
        with maker() as source:
            upload_ownership.complete_upload(source, claim, b"abc")

    with ThreadPoolExecutor(max_workers=2) as pool:
        future = pool.submit(finish_upload)
        assert store.put_started.wait(timeout=5)

        # complete_upload holds FOR UPDATE only around provider mutation and DB
        # finalize. Cleanup skips rather than waiting or deleting underneath it.
        with maker() as cleanup_session:
            assert cleanup._expire_stale_uploads(cleanup_session) == 0
            cleanup_session.commit()

        store.allow_put.set()
        future.result(timeout=5)

    with maker() as session:
        attachment = session.get(Attachment, setup.attachment_id)
        assert attachment is not None
        assert attachment.status == AttachmentStatus.UPLOADING.value
        assert attachment.uploaded_at is not None
        assert attachment.upload_claim_id is None
        assert attachment.upload_lease_until is None
    assert store.objects[setup.storage_key] == b"abc"


def test_cleanup_wins_before_claim_and_upload_never_reaches_provider(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """B: cleanup row ownership wins, so later upload performs no put."""
    _, maker = production_client
    setup = _stale_upload(maker)
    store = ControlledStore()
    store.allow_delete.clear()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    def cleanup_first() -> tuple[int, int, int]:
        return _expire_and_purge(maker)

    upload_started = Event()

    def attempt_upload() -> DomainError | None:
        upload_started.set()
        try:
            with maker() as source:
                claim = upload_ownership.claim_upload(
                    source,
                    setup.context,
                    setup.attachment_id,
                )
                upload_ownership.complete_upload(source, claim, b"abc")
        except DomainError as error:
            return error
        return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        cleanup_future = pool.submit(cleanup_first)
        assert store.delete_started.wait(timeout=5)
        upload_future = pool.submit(attempt_upload)
        assert upload_started.wait(timeout=5)

        store.allow_delete.set()
        assert cleanup_future.result(timeout=5) == (1, 1, 0)
        error = upload_future.result(timeout=5)

    assert error is not None
    assert error.status in {404, 409}
    assert store.put_calls == 0
    with maker() as session:
        assert session.get(Attachment, setup.attachment_id) is None


def test_provider_write_with_db_finalize_failure_keeps_cleanup_anchor(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """C: provider success + DB failure is repaired through the committed claim row."""
    _, maker = production_client
    setup = _stale_upload(maker)
    store = ControlledStore()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    with maker() as source:
        claim = upload_ownership.claim_upload(source, setup.context, setup.attachment_id)

    def fail_flush(_session: Session) -> None:
        raise RuntimeError("boom")

    with monkeypatch.context() as patch:
        patch.setattr(service, "_flush", fail_flush)
        with maker() as source, pytest.raises(RuntimeError, match="boom"):
            upload_ownership.complete_upload(source, claim, b"abc")

    assert store.objects[setup.storage_key] == b"abc"
    with maker() as session:
        attachment = session.get(Attachment, setup.attachment_id)
        assert attachment is not None
        assert attachment.status == AttachmentStatus.PENDING.value
        assert attachment.upload_claim_id == claim.token
        # Simulate process death: nobody releases the claim; only its bounded
        # lease expires, while the authoritative Attachment row remains.
        attachment.upload_lease_until = now() - timedelta(seconds=1)
        session.commit()

    assert _expire_and_purge(maker) == (1, 1, 0)
    assert setup.storage_key not in store.objects
    with maker() as session:
        assert session.get(Attachment, setup.attachment_id) is None


@pytest.mark.parametrize("initial_status", [AttachmentStatus.PENDING, AttachmentStatus.UPLOADING])
def test_legitimate_retry_reclaims_stale_upload_without_resetting_retention(
    production_client,
    monkeypatch,
    initial_status: AttachmentStatus,
) -> None:  # type: ignore[no-untyped-def]
    """D: stale PENDING/UPLOADING can retry, then becomes eligible after abort."""
    _, maker = production_client
    setup = _stale_upload(maker, status=initial_status)
    store = ControlledStore()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    with maker() as source:
        first = upload_ownership.claim_upload(source, setup.context, setup.attachment_id)
    with maker() as session:
        assert cleanup._expire_stale_uploads(session) == 0
        session.commit()
    with maker() as source:
        upload_ownership.release_upload_claim(source, first)

    with maker() as source:
        second = upload_ownership.claim_upload(source, setup.context, setup.attachment_id)
    assert second.token != first.token
    with maker() as session:
        assert cleanup._expire_stale_uploads(session) == 0
        session.commit()
    with maker() as source:
        upload_ownership.release_upload_claim(source, second)

    # Claims never refreshed created_at/uploaded_at, so abort immediately
    # restores the pre-existing stale eligibility instead of granting 24h more.
    assert _expire_and_purge(maker) == (1, 1, 0)


def test_ready_unbound_retention_regression_is_unchanged(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """E: the established 60-minute READY binding window remains independent."""
    _, maker = production_client
    setup = _stale_upload(maker)
    store = ControlledStore()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    with maker() as session:
        attachment = session.get(Attachment, setup.attachment_id)
        assert attachment is not None
        attachment.status = AttachmentStatus.READY.value
        attachment.ready_at = now() - service.BINDING_WINDOW - timedelta(minutes=1)
        session.commit()

    with maker() as session:
        assert cleanup._expire_unbound_ready(session) == 1
        session.flush()
        removed, failed = cleanup._purge_marked(session)
        session.commit()
    assert (removed, failed) == (1, 0)
    with maker() as session:
        assert session.get(Attachment, setup.attachment_id) is None


def test_signed_upload_capability_expires_before_stale_retention_horizon() -> None:
    """F: a live signed PUT capability cannot outlast the stale-row anchor."""
    assert attachment_api.SIGNED_UPLOAD_TTL < cleanup.UPLOAD_RETENTION


def test_signed_finalize_wins_row_authority_before_cleanup(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """F: S3-style finalize and stale cleanup share the same row authority."""
    _, maker = production_client
    setup = _stale_upload(maker)
    store = ControlledStore()
    store.objects[setup.storage_key] = b"abc"
    store.allow_exists.clear()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    def finalize() -> str:
        with maker() as session:
            attachment = upload_ownership.finalize_upload(
                session,
                setup.context,
                setup.attachment_id,
            )
            status = attachment.status
            session.commit()
            return status

    with ThreadPoolExecutor(max_workers=2) as pool:
        future = pool.submit(finalize)
        assert store.exists_started.wait(timeout=5)
        with maker() as cleanup_session:
            assert cleanup._expire_stale_uploads(cleanup_session) == 0
            cleanup_session.commit()
        store.allow_exists.set()
        assert future.result(timeout=5) == AttachmentStatus.VALIDATING.value

    assert store.objects[setup.storage_key] == b"abc"
    with maker() as session:
        attachment = session.execute(
            select(Attachment).where(Attachment.id == setup.attachment_id)
        ).scalar_one()
        assert attachment.status == AttachmentStatus.VALIDATING.value


def test_signed_cleanup_wins_before_finalize_with_controlled_domain_error(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """F: cleanup-first removes the direct-upload object and finalize cannot revive it."""
    _, maker = production_client
    setup = _stale_upload(maker)
    store = ControlledStore()
    store.objects[setup.storage_key] = b"abc"
    store.allow_delete.clear()
    monkeypatch.setattr(service, "get_media_store", lambda: store)

    def finalize_after_cleanup() -> DomainError | None:
        try:
            with maker() as session:
                upload_ownership.finalize_upload(session, setup.context, setup.attachment_id)
                session.commit()
        except DomainError as error:
            return error
        return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        cleanup_future = pool.submit(_expire_and_purge, maker)
        assert store.delete_started.wait(timeout=5)
        finalize_future = pool.submit(finalize_after_cleanup)
        store.allow_delete.set()
        assert cleanup_future.result(timeout=5) == (1, 1, 0)
        error = finalize_future.result(timeout=5)

    assert error is not None
    assert error.status in {404, 409}
    assert setup.storage_key not in store.objects
    with maker() as session:
        assert session.get(Attachment, setup.attachment_id) is None
