"""Background jobs for Transfer Bundle generation, validation and cleanup."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import BadRequestError, ErrorCode
from eimir.identity import effects as account_effects
from eimir.jobs import queue
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.media import get_media_store
from eimir.transfer import service
from eimir.transfer.models import (
    ExportStatus,
    ImportStatus,
    TransferExport,
    TransferImport,
    TransferScope,
)

log = logging.getLogger(__name__)
CLEANUP_INTERVAL = timedelta(minutes=30)
_LOCK_KEY = 8_150_345
_EXPORT_TERMINAL = {
    ExportStatus.READY.value,
    ExportStatus.FAILED.value,
    ExportStatus.EXPIRED.value,
}
_VALIDATE_IMPORT_TERMINAL = {
    ImportStatus.READY_TO_APPLY.value,
    ImportStatus.APPLYING.value,
    ImportStatus.COMPLETED.value,
    ImportStatus.FAILED.value,
    ImportStatus.EXPIRED.value,
}
_APPLY_IMPORT_TERMINAL = {
    ImportStatus.COMPLETED.value,
    ImportStatus.FAILED.value,
    ImportStatus.EXPIRED.value,
}


def _lock(session: Session) -> None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))


def _open_cleanup_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(
                Job.kind == service.CLEANUP_JOB_KIND,
                Job.status.in_([status.value for status in statuses]),
            )
        ).scalar_one()
    )


def ensure_scheduled(session: Session) -> Job | None:
    _lock(session)
    if _open_cleanup_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    return queue.enqueue(session, service.CLEANUP_JOB_KIND)


def schedule_next(session: Session) -> Job | None:
    _lock(session)
    if _open_cleanup_jobs(session, JobStatus.PENDING):
        return None
    return queue.enqueue(session, service.CLEANUP_JOB_KIND, delay=CLEANUP_INTERVAL)


def _active_authorization(
    session: Session, *, space_id: UUID, account_id: UUID
) -> AuthorizationContext | None:
    if account_effects.lock_enabled_accounts(session, [account_id]) is None:
        return None
    if not account_effects.has_active_membership(
        session,
        account_id=account_id,
        space_id=space_id,
    ):
        return None
    return AuthorizationContext(account_id=account_id, space_id=space_id)


def _lock_export(session: Session, identifier: UUID) -> TransferExport | None:
    return session.execute(
        select(TransferExport)
        .where(TransferExport.id == identifier)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()


def _lock_import(session: Session, identifier: UUID) -> TransferImport | None:
    return session.execute(
        select(TransferImport)
        .where(TransferImport.id == identifier)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()


def _identifier(payload: dict[str, Any], key: str) -> UUID | None:
    raw = payload.get(key)
    if not isinstance(raw, str):
        return None
    try:
        return UUID(raw)
    except ValueError:
        return None


def handle_export(session: Session, payload: dict[str, Any]) -> None:
    identifier = _identifier(payload, "exportId")
    if identifier is None:
        return
    probe = session.get(TransferExport, identifier)
    if probe is None or probe.status in _EXPORT_TERMINAL:
        return
    if probe.expires_at <= now():
        service.cleanup_expired(session)
        return

    # Account deletion cleanup takes the same locks in Account -> Transfer
    # order. Revalidate the Transfer row after obtaining the Account lock so a
    # concurrent accepted deletion cannot deadlock or be overwritten by stale
    # in-memory status.
    authorization = _active_authorization(
        session, space_id=probe.space_id, account_id=probe.created_by
    )
    transfer = _lock_export(session, identifier)
    if transfer is None or transfer.status in _EXPORT_TERMINAL:
        return
    if transfer.expires_at <= now():
        service.cleanup_expired(session)
        return
    if authorization is None:
        transfer.status = ExportStatus.FAILED.value
        transfer.error_code = ErrorCode.TRANSFER_EXPORT_FAILED
        return
    transfer.status = ExportStatus.RUNNING.value
    session.flush()

    try:
        # A dedicated repeatable-read transaction gives all domain queries in
        # the archive one deterministic snapshot even though the worker's Job
        # row was claimed in a separate transaction.
        bind = session.get_bind()
        engine = bind.engine if isinstance(bind, Connection) else bind
        with (
            engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection,
            Session(bind=connection) as snapshot,
            snapshot.begin(),
        ):
            archive = service.build_export_archive(
                snapshot,
                authorization,
                TransferScope(transfer.scope),
            )
        try:
            store = get_media_store()
            stored = store.put(service.export_storage_key(transfer), archive, "application/zip")
        finally:
            archive.close()
    except BadRequestError as error:
        transfer.status = ExportStatus.FAILED.value
        transfer.error_code = error.code
        return
    except OSError as error:
        raise RetryableJobError("Transfer export storage is temporarily unavailable.") from error

    transfer.status = ExportStatus.READY.value
    transfer.artifact_size = stored.size
    transfer.ready_at = now()
    transfer.error_code = None
    log.info(
        "transfer export ready",
        extra={"transfer_id": str(transfer.id), "size": stored.size, "scope": transfer.scope},
    )


def handle_validate_import(session: Session, payload: dict[str, Any]) -> None:
    identifier = _identifier(payload, "importId")
    if identifier is None:
        return
    probe = session.get(TransferImport, identifier)
    if probe is None or probe.status in _VALIDATE_IMPORT_TERMINAL:
        return
    if probe.expires_at <= now():
        service.cleanup_expired(session)
        return

    authorization = _active_authorization(
        session, space_id=probe.space_id, account_id=probe.created_by
    )
    transfer = _lock_import(session, identifier)
    if transfer is None or transfer.status in _VALIDATE_IMPORT_TERMINAL:
        return
    if transfer.expires_at <= now():
        service.cleanup_expired(session)
        return
    if authorization is None:
        transfer.status = ImportStatus.FAILED.value
        transfer.error_code = ErrorCode.TRANSFER_IMPORT_FAILED
        return
    transfer.status = ImportStatus.VALIDATING.value
    session.flush()

    try:
        with get_media_store().open(service.import_storage_key(transfer)) as source:
            graph = service.validate_import_bundle(
                session,
                authorization,
                source,
                compressed_size=transfer.artifact_size,
            )
    except BadRequestError as error:
        transfer.status = ImportStatus.FAILED.value
        transfer.error_code = error.code
        return
    except OSError as error:
        raise RetryableJobError("Transfer import storage is temporarily unavailable.") from error

    transfer.scope = graph.scope.value
    transfer.source_space_id = graph.source_space_id
    transfer.source_owner_id = graph.personal_owner_source_id
    transfer.member_mapping = {str(source): str(target) for source, target in graph.mapping.items()}
    transfer.summary = graph.summary
    transfer.validated_at = now()
    transfer.status = ImportStatus.READY_TO_APPLY.value
    transfer.error_code = None
    log.info(
        "transfer import validated",
        extra={
            "transfer_id": str(transfer.id),
            "scope": graph.scope.value,
            "media_count": graph.summary.get("mediaCount", 0),
        },
    )


def handle_apply_import(session: Session, payload: dict[str, Any]) -> None:
    identifier = _identifier(payload, "importId")
    if identifier is None:
        return
    probe = session.get(TransferImport, identifier)
    if probe is None or probe.status in _APPLY_IMPORT_TERMINAL:
        return
    if probe.expires_at <= now():
        service.cleanup_expired(session)
        return

    authorization = _active_authorization(
        session, space_id=probe.space_id, account_id=probe.created_by
    )
    transfer = _lock_import(session, identifier)
    if transfer is None or transfer.status in _APPLY_IMPORT_TERMINAL:
        return
    if transfer.expires_at <= now():
        service.cleanup_expired(session)
        return
    if authorization is None:
        transfer.status = ImportStatus.FAILED.value
        transfer.error_code = ErrorCode.TRANSFER_IMPORT_FAILED
        return
    transfer.status = ImportStatus.APPLYING.value
    session.flush()

    try:
        with get_media_store().open(service.import_storage_key(transfer)) as source:
            service.apply_import_bundle(session, authorization, transfer, source)
    except BadRequestError as error:
        transfer.status = ImportStatus.FAILED.value
        transfer.error_code = error.code
        return
    except OSError as error:
        raise RetryableJobError("Transfer import storage is temporarily unavailable.") from error

    transfer.status = ImportStatus.COMPLETED.value
    transfer.completed_at = now()
    transfer.error_code = None
    # The source archive is no longer needed after a successful atomic apply.
    # A failed immediate delete remains marked by artifact_size > 0 so the
    # scheduled retention cleanup retries it no later than the 24h boundary.
    try:
        get_media_store().delete(service.import_storage_key(transfer))
        transfer.artifact_size = 0
    except OSError:
        log.warning("completed transfer import archive cleanup failed")
    log.info("transfer import applied", extra={"transfer_id": str(transfer.id)})


def _cleanup_completed_import_archives(session: Session) -> int:
    transfers = session.execute(
        select(TransferImport).where(
            TransferImport.status == ImportStatus.COMPLETED.value,
            TransferImport.expires_at <= now(),
            TransferImport.artifact_size > 0,
        )
    ).scalars()
    count = 0
    store = get_media_store()
    for transfer in transfers:
        store.delete(service.import_storage_key(transfer))
        transfer.artifact_size = 0
        count += 1
    return count


def handle_cleanup(session: Session, payload: dict[str, Any]) -> None:
    del payload
    try:
        affected = service.cleanup_expired(session)
        affected += _cleanup_completed_import_archives(session)
    except OSError as error:
        raise RetryableJobError("Transfer cleanup storage is temporarily unavailable.") from error
    log.info("transfer cleanup completed", extra={"expired_transfers": affected})
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    handlers = {
        service.EXPORT_JOB_KIND: handle_export,
        service.IMPORT_VALIDATE_JOB_KIND: handle_validate_import,
        service.IMPORT_APPLY_JOB_KIND: handle_apply_import,
        service.CLEANUP_JOB_KIND: handle_cleanup,
    }
    for kind, handler in handlers.items():
        if destination.get(kind) is None:
            destination.register(kind, handler)
