"""Authoritative Transfer Bundle export/import runtime."""

from __future__ import annotations

import io
import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from typing import IO, Any
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from pydantic import BaseModel
from sqlalchemy import MetaData, Table, and_, or_, select
from sqlalchemy.orm import Session

from eimir.attachments.models import AttachmentStatus
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.core.errors import BadRequestError, ConflictError, ErrorCode, NotFoundError
from eimir.core.ids import new_id, parse_id
from eimir.identity.models import Account, AccountEmail
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.queue import enqueue
from eimir.media import build_storage_key, get_media_store
from eimir.relationship.models import Membership, MembershipStatus, SpaceProfile
from eimir.transfer.archive import (
    MAX_COMPRESSED_BYTES,
    TransferArchiveError,
    add_bytes,
    add_stream,
    json_bytes,
    manifest_bytes,
    parse_json_bytes,
    validate_zip,
)
from eimir.transfer.models import (
    ExportStatus,
    ImportStatus,
    TransferExport,
    TransferImport,
    TransferScope,
)
from eimir.transfer.payload_boundary import protect_values, reveal_row

_log = logging.getLogger(__name__)
RETENTION = timedelta(hours=24)
APPLICATION_VERSION = "0.1.0"
EXPORT_JOB_KIND = "transfer.export.generate.v1"
IMPORT_VALIDATE_JOB_KIND = "transfer.import.validate.v1"
IMPORT_APPLY_JOB_KIND = "transfer.import.apply.v1"
CLEANUP_JOB_KIND = "transfer.cleanup.v1"

# Explicit portability allowlist. Authentication, sessions, jobs, outbox,
# activity/notification projections, entitlements, and runtime occurrence state
# cannot enter the archive because they have no entry here.
FILE_TABLES: dict[str, tuple[str, ...]] = {
    "space.json": ("space_profiles",),
    "profiles.json": ("partner_profiles", "partner_nicknames", "profile_preferences"),
    "people.json": ("related_persons", "important_dates"),
    "memories.json": ("memories", "memory_attachments"),
    "heart-moments.json": ("heart_moments",),
    "milestones.json": ("milestones",),
    "comments.json": ("comments",),
    "wishes.json": ("wishes",),
    "plans.json": ("plans",),
    "places.json": (
        "places",
        "place_memories",
        "place_milestones",
        "place_heart_moments",
    ),
    "chapters.json": (
        "chapters",
        "chapter_memories",
        "chapter_milestones",
        "chapter_heart_moments",
    ),
    "collections.json": ("collections", "collection_items"),
    "reminders.json": ("reminders", "reminder_offsets", "reminder_preferences"),
    "rules.json": ("rule_preferences",),
    "private/notes.json": ("private_notes",),
    "private/gift-ideas.json": ("gift_ideas",),
    "private/collections.json": ("private_collections", "private_collection_items"),
}
PRIVATE_FILES = frozenset(name for name in FILE_TABLES if name.startswith("private/"))
PRIVATE_ROOTS = frozenset({"private_notes", "gift_ideas", "private_collections"})
ACCOUNT_SCOPED_CONFIG_TABLES = frozenset({"rule_preferences", "reminder_preferences"})
CHILD_PARENT: dict[str, tuple[str, str]] = {
    "collection_items": ("collection_id", "collections"),
    "private_collection_items": ("collection_id", "private_collections"),
    "reminder_offsets": ("reminder_id", "reminders"),
    "reminder_preferences": ("reminder_id", "reminders"),
    "memory_attachments": ("memory_id", "memories"),
}
RELATION_REQUIREMENTS: dict[str, tuple[tuple[str, str], ...]] = {
    "place_memories": (("place_id", "places"), ("memory_id", "memories")),
    "place_milestones": (("place_id", "places"), ("milestone_id", "milestones")),
    "place_heart_moments": (("place_id", "places"), ("heart_moment_id", "heart_moments")),
    "chapter_memories": (("chapter_id", "chapters"), ("memory_id", "memories")),
    "chapter_milestones": (("chapter_id", "chapters"), ("milestone_id", "milestones")),
    "chapter_heart_moments": (
        ("chapter_id", "chapters"),
        ("heart_moment_id", "heart_moments"),
    ),
}
ACCOUNT_REFERENCE_COLUMNS = frozenset({"owner_id", "created_by", "account_id"})
INSERT_ORDER = (
    "space_profiles",
    "partner_profiles",
    "partner_nicknames",
    "profile_preferences",
    "related_persons",
    "important_dates",
    "memories",
    "heart_moments",
    "milestones",
    "wishes",
    "places",
    "plans",
    "chapters",
    "collections",
    "collection_items",
    "private_notes",
    "gift_ideas",
    "private_collections",
    "private_collection_items",
    "reminders",
    "reminder_offsets",
    "reminder_preferences",
    "rule_preferences",
    "comments",
    "place_memories",
    "place_milestones",
    "place_heart_moments",
    "chapter_memories",
    "chapter_milestones",
    "chapter_heart_moments",
    "memory_attachments",
)


class TransferNotFoundError(NotFoundError):
    pass


@dataclass(frozen=True)
class ValidatedGraph:
    scope: TransferScope
    source_space_id: UUID
    personal_owner_source_id: UUID | None
    mapping: dict[UUID, UUID]
    tables: dict[str, list[dict[str, Any]]]
    media: list[dict[str, Any]]
    summary: dict[str, object]


def export_storage_key(export: TransferExport) -> str:
    return f"spaces/{export.space_id}/transfers/exports/{export.id}/bundle.zip"


def import_storage_key(transfer_import: TransferImport) -> str:
    return f"spaces/{transfer_import.space_id}/transfers/imports/{transfer_import.id}/bundle.zip"


def _snake_to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def _camel_to_snake(value: str) -> str:
    chars: list[str] = []
    for char in value:
        if char.isupper():
            chars.append("_")
            chars.append(char.lower())
        else:
            chars.append(char)
    return "".join(chars)


def _json_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, StrEnum):
        return value.value
    if isinstance(value, BaseModel):
        return _json_value(value.model_dump(mode="json"))
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _json_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {_snake_to_camel(key): _json_value(value) for key, value in row.items()}


def _table(session: Session, name: str, metadata: MetaData) -> Table:
    return Table(name, metadata, autoload_with=session.get_bind())


def _selected_ids(rows: dict[str, list[dict[str, Any]]], table_name: str) -> set[UUID]:
    values: set[UUID] = set()
    for row in rows.get(table_name, []):
        raw = row.get("id")
        if isinstance(raw, UUID):
            values.add(raw)
    return values


def _load_root_rows(
    session: Session,
    table: Table,
    *,
    authorization: AuthorizationContext,
    scope: TransferScope,
) -> list[dict[str, Any]]:
    columns = table.c
    if "space_id" not in columns:
        return []
    predicate = columns.space_id == authorization.space_id
    if "privacy_class" in columns:
        shared = columns.privacy_class == PrivacyClass.SPACE_SHARED.value
        if scope is TransferScope.SHARED:
            predicate = and_(predicate, shared)
        else:
            private = and_(
                columns.privacy_class == PrivacyClass.OWNER_ONLY.value,
                columns.owner_id == authorization.account_id,
            )
            predicate = and_(predicate, or_(shared, private))
    elif table.name in PRIVATE_ROOTS:
        # Defense in depth if a future private table accidentally loses the
        # privacy column from a migration: never make it shared by omission.
        if scope is TransferScope.SHARED:
            return []
        predicate = and_(predicate, columns.owner_id == authorization.account_id)
    result = session.execute(select(table).where(predicate)).mappings()
    return [reveal_row(table.name, dict(row)) for row in result]


def _load_child_rows(
    session: Session,
    table: Table,
    *,
    parent_column: str,
    parent_ids: set[UUID],
) -> list[dict[str, Any]]:
    if not parent_ids:
        return []
    return [
        reveal_row(table.name, dict(row))
        for row in session.execute(
            select(table).where(table.c[parent_column].in_(parent_ids))
        ).mappings()
    ]


def _prune_relations(rows: dict[str, list[dict[str, Any]]]) -> None:
    for table_name, requirements in RELATION_REQUIREMENTS.items():
        kept: list[dict[str, Any]] = []
        targets = {target: _selected_ids(rows, target) for _, target in requirements}
        for row in rows.get(table_name, []):
            if all(row.get(column) in targets[target] for column, target in requirements):
                kept.append(row)
        rows[table_name] = kept

    valid_comment_targets = {
        "MEMORY": _selected_ids(rows, "memories"),
        "HEART_MOMENT": _selected_ids(rows, "heart_moments"),
        "MILESTONE": _selected_ids(rows, "milestones"),
    }
    rows["comments"] = [
        row
        for row in rows.get("comments", [])
        if row.get("target_id") in valid_comment_targets.get(str(row.get("target_type")), set())
    ]


def _portable_rows(
    session: Session,
    authorization: AuthorizationContext,
    scope: TransferScope,
) -> dict[str, list[dict[str, Any]]]:
    metadata = MetaData()
    rows: dict[str, list[dict[str, Any]]] = {}
    all_tables = {name for names in FILE_TABLES.values() for name in names}

    for table_name in all_tables:
        if table_name in CHILD_PARENT or table_name in RELATION_REQUIREMENTS:
            continue
        table = _table(session, table_name, metadata)
        rows[table_name] = _load_root_rows(session, table, authorization=authorization, scope=scope)

    # A personal export carries the viewer's current relationship label only.
    # A former partner's old label must not create an unmappable account reference.
    if rows.get("partner_nicknames"):
        active_account_ids = set(
            session.execute(
                select(Membership.account_id).where(
                    Membership.space_id == authorization.space_id,
                    Membership.status == MembershipStatus.ACTIVE.value,
                )
            ).scalars()
        )
        rows["partner_nicknames"] = [
            row for row in rows["partner_nicknames"] if row["account_id"] in active_account_ids
        ]

    # Relation tables carry space_id but derive visibility from both targets.
    for table_name in RELATION_REQUIREMENTS:
        table = _table(session, table_name, metadata)
        rows[table_name] = [
            dict(row)
            for row in session.execute(
                select(table).where(table.c.space_id == authorization.space_id)
            ).mappings()
        ]

    for child_name, (parent_column, parent_table) in CHILD_PARENT.items():
        if parent_table == "private_collections" and scope is TransferScope.SHARED:
            rows[child_name] = []
            continue
        table = _table(session, child_name, metadata)
        loaded = _load_child_rows(
            session,
            table,
            parent_column=parent_column,
            parent_ids=_selected_ids(rows, parent_table),
        )
        if child_name == "reminder_preferences":
            loaded = [
                row
                for row in loaded
                if scope is TransferScope.PERSONAL
                and row.get("account_id") == authorization.account_id
            ]
        rows[child_name] = loaded

    # Rule and reminder preferences are account-scoped user configuration even
    # though their persistence tables predate the generic privacy_class column.
    # They are portable only in PERSONAL and only for the requesting account.
    if "rule_preferences" in rows:
        if scope is TransferScope.SHARED:
            rows["rule_preferences"] = []
        else:
            table = _table(session, "rule_preferences", metadata)
            rows["rule_preferences"] = [
                dict(row)
                for row in session.execute(
                    select(table).where(
                        table.c.space_id == authorization.space_id,
                        table.c.account_id == authorization.account_id,
                    )
                ).mappings()
            ]

    _prune_relations(rows)
    return rows


def _source_accounts(session: Session, space_id: UUID) -> list[dict[str, Any]]:
    memberships = session.execute(
        select(Membership).where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalars()
    result: list[dict[str, Any]] = []
    for membership in memberships:
        account = session.get(Account, membership.account_id)
        if account is None:
            continue
        email = (
            session.execute(
                select(AccountEmail)
                .where(
                    AccountEmail.account_id == account.id,
                    AccountEmail.verified_at.is_not(None),
                )
                .order_by(AccountEmail.is_primary.desc(), AccountEmail.created_at, AccountEmail.id)
            )
            .scalars()
            .first()
        )
        result.append(
            {
                "sourceId": str(account.id),
                "displayName": account.display_name,
                "birthday": account.birthday.isoformat() if account.birthday else None,
                "locale": account.locale,
                "timezone": account.timezone,
                "verifiedEmail": email.email if email is not None else None,
            }
        )
    return sorted(result, key=lambda item: item["sourceId"])


def _media_rows(
    session: Session,
    rows: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    attachment_ids: set[UUID] = {
        row["attachment_id"]
        for row in rows.get("memory_attachments", [])
        if isinstance(row.get("attachment_id"), UUID)
    }
    attachment_ids.update(
        row["attachment_id"]
        for row in rows.get("heart_moments", [])
        if isinstance(row.get("attachment_id"), UUID)
    )
    attachment_ids.update(
        row["avatar_attachment_id"]
        for row in rows.get("related_persons", [])
        if isinstance(row.get("avatar_attachment_id"), UUID)
    )
    if not attachment_ids:
        return []
    metadata = MetaData()
    table = _table(session, "attachments", metadata)
    result: list[dict[str, Any]] = []
    for row in session.execute(select(table).where(table.c.id.in_(attachment_ids))).mappings():
        item = reveal_row("attachments", dict(row))
        if item.get("status") != AttachmentStatus.READY.value:
            continue
        result.append(
            {
                "sourceId": str(item["id"]),
                "ownerSourceId": str(item["owner_id"]),
                "mediaType": item["media_type"],
                "mimeType": item.get("mime_type") or item["declared_mime_type"],
                "size": item.get("size") or item["declared_size"],
                "width": item.get("width"),
                "height": item.get("height"),
                "durationSeconds": item.get("duration_seconds"),
                "hasThumbnail": bool(item.get("has_thumbnail")),
                "capturedAt": _json_value((item.get("payload") or {}).get("captured_at")),
                "orientation": (item.get("payload") or {}).get("orientation"),
            }
        )
    found = {UUID(item["sourceId"]) for item in result}
    # A domain relation must never be exported with a missing/non-ready media
    # target: silently keeping the relation would manufacture a broken graph.
    missing = attachment_ids - found
    if missing:
        raise BadRequestError("Portable media is not ready.", ErrorCode.TRANSFER_EXPORT_FAILED)
    return sorted(result, key=lambda item: item["sourceId"])


def _new_plaintext_export_buffer() -> IO[bytes]:
    """Return a seekable plaintext buffer without a filesystem-backed temp file.

    Linux production workers use an anonymous memfd so large exports do not
    consume Python heap while the archive is assembled. Platforms without
    memfd support fall back to BytesIO. In either case plaintext never spills
    into a worker filesystem path before the completed archive enters the
    encrypted MediaStore.
    """
    memfd_create = getattr(os, "memfd_create", None)
    if callable(memfd_create):
        descriptor = memfd_create(
            "eimir-transfer-export",
            flags=getattr(os, "MFD_CLOEXEC", 0),
        )
        return os.fdopen(descriptor, "w+b")
    return io.BytesIO()


def build_export_archive(
    session: Session,
    authorization: AuthorizationContext,
    scope: TransferScope,
) -> IO[bytes]:
    """Build one deterministic snapshot archive in an anonymous memory buffer."""
    rows = _portable_rows(session, authorization, scope)
    media = _media_rows(session, rows)
    accounts = _source_accounts(session, authorization.space_id)
    output = _new_plaintext_export_buffer()
    checksums: dict[str, str] = {}
    store = get_media_store()
    with ZipFile(output, mode="w", compression=ZIP_DEFLATED, allowZip64=True) as archive:
        add_bytes(archive, "accounts.json", json_bytes({"members": accounts}), checksums)
        for file_name, table_names in FILE_TABLES.items():
            if scope is TransferScope.SHARED and file_name in PRIVATE_FILES:
                continue
            document = {
                "tables": [
                    {
                        "name": table_name,
                        "rows": [_json_row(row) for row in rows.get(table_name, [])],
                    }
                    for table_name in table_names
                    if rows.get(table_name)
                ]
            }
            if document["tables"]:
                add_bytes(archive, file_name, json_bytes(document), checksums)

        media_index: list[dict[str, Any]] = []
        for item in media:
            source_id = UUID(item["sourceId"])
            variants = ["original"]
            if item["hasThumbnail"]:
                variants.append("thumbnail")
            stored_variants: list[str] = []
            for variant in variants:
                key = build_storage_key(authorization.space_id, source_id, variant)
                if not store.exists(key):
                    if variant == "thumbnail":
                        continue
                    raise BadRequestError(
                        "Portable media is missing.", ErrorCode.TRANSFER_EXPORT_FAILED
                    )
                entry_name = f"media/{source_id}/{variant}"
                with store.open(key) as source:
                    add_stream(archive, entry_name, source, checksums)
                stored_variants.append(variant)
            media_index.append({**item, "variants": stored_variants})
        if media_index:
            add_bytes(archive, "media/index.json", json_bytes({"items": media_index}), checksums)

        archive.writestr(
            "manifest.json",
            manifest_bytes(
                exported_at=now().isoformat(),
                application_version=APPLICATION_VERSION,
                scope=scope.value,
                source_space_id=str(authorization.space_id),
                checksums=checksums,
                exported_by_source_id=str(authorization.account_id),
                personal_owner_source_id=(
                    str(authorization.account_id) if scope is TransferScope.PERSONAL else None
                ),
            ),
            compress_type=ZIP_DEFLATED,
        )
    output.seek(0)
    return output


def create_export(
    session: Session,
    authorization: AuthorizationContext,
    scope: TransferScope,
) -> TransferExport:
    transfer = TransferExport(
        space_id=authorization.space_id,
        created_by=authorization.account_id,
        scope=scope.value,
        status=ExportStatus.QUEUED.value,
        expires_at=now() + RETENTION,
    )
    session.add(transfer)
    session.flush()
    job = enqueue(session, EXPORT_JOB_KIND, {"exportId": str(transfer.id)})
    transfer.job_id = job.id
    return transfer


def _transfer_id(raw: str, *, kind: str) -> UUID:
    parsed = parse_id(raw)
    if parsed is None:
        raise TransferNotFoundError(f"{kind} not found.", "TRANSFER_NOT_FOUND")
    return parsed


def _job_failed(session: Session, job_id: UUID | None) -> bool:
    if job_id is None:
        return False
    job = session.get(Job, job_id)
    return job is not None and job.status == JobStatus.FAILED.value


def _expire_export(session: Session, transfer: TransferExport) -> None:
    if transfer.status == ExportStatus.EXPIRED.value:
        return
    get_media_store().delete(export_storage_key(transfer))
    transfer.status = ExportStatus.EXPIRED.value
    transfer.artifact_size = None


def _expire_import(session: Session, transfer: TransferImport) -> None:
    if transfer.status == ImportStatus.EXPIRED.value:
        return
    get_media_store().delete(import_storage_key(transfer))
    transfer.status = ImportStatus.EXPIRED.value


def get_export(
    session: Session,
    authorization: AuthorizationContext,
    export_id: str,
) -> TransferExport:
    parsed = _transfer_id(export_id, kind="Transfer export")
    transfer = session.execute(
        select(TransferExport).where(
            TransferExport.id == parsed,
            TransferExport.space_id == authorization.space_id,
            TransferExport.created_by == authorization.account_id,
        )
    ).scalar_one_or_none()
    if transfer is None:
        raise TransferNotFoundError("Transfer export not found.", "TRANSFER_NOT_FOUND")
    if transfer.expires_at <= now() and transfer.status != ExportStatus.EXPIRED.value:
        _expire_export(session, transfer)
    elif transfer.status not in {
        ExportStatus.READY.value,
        ExportStatus.FAILED.value,
        ExportStatus.EXPIRED.value,
    } and _job_failed(session, transfer.job_id):
        transfer.status = ExportStatus.FAILED.value
        transfer.error_code = ErrorCode.TRANSFER_EXPORT_FAILED
    return transfer


def open_export_download(
    session: Session,
    authorization: AuthorizationContext,
    export_id: str,
) -> tuple[TransferExport, IO[bytes]]:
    transfer = get_export(session, authorization, export_id)
    if transfer.status == ExportStatus.EXPIRED.value:
        raise ConflictError("Transfer export has expired.", ErrorCode.TRANSFER_EXPIRED)
    if transfer.status != ExportStatus.READY.value:
        raise ConflictError("Transfer export is not ready.", ErrorCode.TRANSFER_NOT_READY)
    store = get_media_store()
    key = export_storage_key(transfer)
    if not store.exists(key):
        transfer.status = ExportStatus.FAILED.value
        transfer.error_code = ErrorCode.TRANSFER_EXPORT_FAILED
        raise ConflictError("Transfer export is not ready.", ErrorCode.TRANSFER_NOT_READY)
    return transfer, store.open(key)


def create_import(
    session: Session,
    authorization: AuthorizationContext,
    source: IO[bytes],
    *,
    size: int,
) -> TransferImport:
    if size <= 0:
        raise TransferArchiveError(
            "Transfer archive is empty.", ErrorCode.TRANSFER_MANIFEST_INVALID
        )
    if size > MAX_COMPRESSED_BYTES:
        from eimir.core.errors import PayloadTooLargeError

        raise PayloadTooLargeError(
            "Transfer archive exceeds the supported resource limits.",
            ErrorCode.TRANSFER_TOO_LARGE,
        )
    transfer = TransferImport(
        space_id=authorization.space_id,
        created_by=authorization.account_id,
        status=ImportStatus.QUEUED.value,
        artifact_size=size,
        expires_at=now() + RETENTION,
    )
    session.add(transfer)
    session.flush()
    source.seek(0)
    get_media_store().put(import_storage_key(transfer), source, "application/zip")
    job = enqueue(session, IMPORT_VALIDATE_JOB_KIND, {"importId": str(transfer.id)})
    transfer.validation_job_id = job.id
    return transfer


def get_import(
    session: Session,
    authorization: AuthorizationContext,
    import_id: str,
) -> TransferImport:
    parsed = _transfer_id(import_id, kind="Transfer import")
    transfer = session.execute(
        select(TransferImport).where(
            TransferImport.id == parsed,
            TransferImport.space_id == authorization.space_id,
            TransferImport.created_by == authorization.account_id,
        )
    ).scalar_one_or_none()
    if transfer is None:
        raise TransferNotFoundError("Transfer import not found.", "TRANSFER_NOT_FOUND")
    validation_job_failed = transfer.status in {
        ImportStatus.QUEUED.value,
        ImportStatus.VALIDATING.value,
    } and _job_failed(session, transfer.validation_job_id)
    apply_job_failed = transfer.status == ImportStatus.APPLYING.value and _job_failed(
        session, transfer.apply_job_id
    )
    if transfer.expires_at <= now() and transfer.status not in {
        ImportStatus.COMPLETED.value,
        ImportStatus.EXPIRED.value,
    }:
        _expire_import(session, transfer)
    elif validation_job_failed or apply_job_failed:
        transfer.status = ImportStatus.FAILED.value
        transfer.error_code = ErrorCode.TRANSFER_IMPORT_FAILED
    return transfer


def request_apply(
    session: Session,
    authorization: AuthorizationContext,
    import_id: str,
) -> TransferImport:
    parsed = _transfer_id(import_id, kind="Transfer import")
    transfer = session.execute(
        select(TransferImport)
        .where(
            TransferImport.id == parsed,
            TransferImport.space_id == authorization.space_id,
            TransferImport.created_by == authorization.account_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if transfer is None:
        raise TransferNotFoundError("Transfer import not found.", "TRANSFER_NOT_FOUND")
    if transfer.expires_at <= now() and transfer.status not in {
        ImportStatus.COMPLETED.value,
        ImportStatus.EXPIRED.value,
    }:
        _expire_import(session, transfer)
    if transfer.status == ImportStatus.COMPLETED.value:
        return transfer
    if transfer.status == ImportStatus.EXPIRED.value:
        raise ConflictError("Transfer import has expired.", ErrorCode.TRANSFER_EXPIRED)
    if transfer.status == ImportStatus.APPLYING.value:
        return transfer
    if transfer.status != ImportStatus.READY_TO_APPLY.value:
        raise ConflictError("Transfer import is not ready.", ErrorCode.TRANSFER_NOT_READY)
    transfer.status = ImportStatus.APPLYING.value
    job = enqueue(session, IMPORT_APPLY_JOB_KIND, {"importId": str(transfer.id)})
    transfer.apply_job_id = job.id
    return transfer


def _load_documents(
    fileobj: IO[bytes],
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    fileobj.seek(0)
    validated = validate_zip(fileobj)
    manifest = validated.manifest
    tables: dict[str, list[dict[str, Any]]] = {}
    seen_tables: set[str] = set()
    allowed_by_file = {name: set(names) for name, names in FILE_TABLES.items()}

    fileobj.seek(0)
    with ZipFile(fileobj, mode="r") as archive:
        accounts_value = (
            parse_json_bytes(archive.read("accounts.json"))
            if "accounts.json" in validated.entries
            else None
        )
        if not isinstance(accounts_value, dict) or not isinstance(
            accounts_value.get("members"), list
        ):
            raise TransferArchiveError(
                "Transfer member metadata is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_REQUIRED
            )
        accounts = accounts_value
        for file_name, allowed_tables in allowed_by_file.items():
            if file_name not in validated.entries:
                continue
            document = parse_json_bytes(archive.read(file_name))
            if not isinstance(document, dict) or not isinstance(document.get("tables"), list):
                raise TransferArchiveError(
                    "Transfer domain document is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                )
            for group in document["tables"]:
                if not isinstance(group, dict):
                    raise TransferArchiveError(
                        "Transfer domain document is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                    )
                table_name = group.get("name")
                rows = group.get("rows")
                if (
                    table_name not in allowed_tables
                    or table_name in seen_tables
                    or not isinstance(rows, list)
                ):
                    raise TransferArchiveError(
                        "Transfer domain document is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                    )
                if not all(isinstance(row, dict) for row in rows):
                    raise TransferArchiveError(
                        "Transfer domain document is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                    )
                seen_tables.add(table_name)
                tables[table_name] = rows
        media: list[dict[str, Any]] = []
        if "media/index.json" in validated.entries:
            media_doc = parse_json_bytes(archive.read("media/index.json"))
            if not isinstance(media_doc, dict) or not isinstance(media_doc.get("items"), list):
                raise TransferArchiveError(
                    "Transfer media index is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                )
            media = media_doc["items"]
            if not all(isinstance(item, dict) for item in media):
                raise TransferArchiveError(
                    "Transfer media index is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                )
    return {"manifest": manifest, "accounts": accounts}, tables, media


def _uuid(value: Any, code: str) -> UUID:
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise TransferArchiveError("Transfer identifier is invalid.", code) from None


def _row_snake(row: Mapping[str, Any]) -> dict[str, Any]:
    return {_camel_to_snake(str(key)): value for key, value in row.items()}


def _validate_ids_and_privacy(
    scope: TransferScope,
    personal_owner: UUID | None,
    tables: dict[str, list[dict[str, Any]]],
    source_member_ids: set[UUID],
) -> dict[str, set[UUID]]:
    ids: dict[str, set[UUID]] = {}
    globally_seen: set[UUID] = set()
    for table_name, json_rows in tables.items():
        table_ids: set[UUID] = set()
        for raw in json_rows:
            row = _row_snake(raw)
            raw_id = row.get("id")
            if raw_id is not None:
                row_id = _uuid(raw_id, ErrorCode.TRANSFER_RELATION_INVALID)
                if row_id in globally_seen:
                    raise TransferArchiveError(
                        "Transfer source IDs are not unique.", ErrorCode.TRANSFER_RELATION_INVALID
                    )
                globally_seen.add(row_id)
                table_ids.add(row_id)
            privacy = row.get("privacy_class")
            owner = row.get("owner_id")
            if privacy is not None and privacy not in {
                PrivacyClass.SPACE_SHARED.value,
                PrivacyClass.OWNER_ONLY.value,
            }:
                raise TransferArchiveError(
                    "Transfer privacy scope is invalid.", ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID
                )
            if scope is TransferScope.SHARED and privacy not in {
                None,
                PrivacyClass.SPACE_SHARED.value,
            }:
                raise TransferArchiveError(
                    "Transfer privacy scope is invalid.", ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID
                )
            if privacy == PrivacyClass.OWNER_ONLY.value:
                if scope is TransferScope.SHARED or personal_owner is None:
                    raise TransferArchiveError(
                        "Transfer privacy scope is invalid.",
                        ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID,
                    )
                if _uuid(owner, ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID) != personal_owner:
                    raise TransferArchiveError(
                        "Transfer privacy scope is invalid.",
                        ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID,
                    )
            elif table_name in PRIVATE_ROOTS:
                raise TransferArchiveError(
                    "Transfer privacy scope is invalid.", ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID
                )
            if table_name in ACCOUNT_SCOPED_CONFIG_TABLES:
                if scope is TransferScope.SHARED or personal_owner is None:
                    raise TransferArchiveError(
                        "Transfer privacy scope is invalid.",
                        ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID,
                    )
                account_id = _uuid(row.get("account_id"), ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID)
                if account_id != personal_owner:
                    raise TransferArchiveError(
                        "Transfer privacy scope is invalid.",
                        ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID,
                    )
            for column in ACCOUNT_REFERENCE_COLUMNS:
                if (
                    row.get(column) is not None
                    and _uuid(row[column], ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
                    not in source_member_ids
                ):
                    raise TransferArchiveError(
                        "Transfer member mapping is invalid.",
                        ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID,
                    )
        ids[table_name] = table_ids
    return ids


def _validate_relations(
    tables: dict[str, list[dict[str, Any]]],
    ids: dict[str, set[UUID]],
) -> None:
    for child, (column, parent) in CHILD_PARENT.items():
        for raw in tables.get(child, []):
            row = _row_snake(raw)
            if _uuid(row.get(column), ErrorCode.TRANSFER_RELATION_INVALID) not in ids.get(
                parent, set()
            ):
                raise TransferArchiveError(
                    "Transfer relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                )
    for table_name, requirements in RELATION_REQUIREMENTS.items():
        for raw in tables.get(table_name, []):
            row = _row_snake(raw)
            for column, target in requirements:
                if _uuid(row.get(column), ErrorCode.TRANSFER_RELATION_INVALID) not in ids.get(
                    target, set()
                ):
                    raise TransferArchiveError(
                        "Transfer relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                    )
    comment_targets = {
        "MEMORY": ids.get("memories", set()),
        "HEART_MOMENT": ids.get("heart_moments", set()),
        "MILESTONE": ids.get("milestones", set()),
    }
    for raw in tables.get("comments", []):
        row = _row_snake(raw)
        target_ids = comment_targets.get(str(row.get("target_type")))
        if (
            target_ids is None
            or _uuid(row.get("target_id"), ErrorCode.TRANSFER_RELATION_INVALID) not in target_ids
        ):
            raise TransferArchiveError(
                "Transfer relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
            )


def _active_target_mapping(
    session: Session,
    target_space: UUID,
    requester_account_id: UUID,
    accounts: dict[str, Any],
    requester_source_id: UUID | None,
) -> tuple[set[UUID], dict[UUID, UUID]]:
    members = accounts.get("members")
    if not isinstance(members, list) or not members:
        raise TransferArchiveError(
            "Transfer member mapping is required.", ErrorCode.TRANSFER_MEMBER_MAPPING_REQUIRED
        )
    target_members = (
        session.execute(
            select(Membership).where(
                Membership.space_id == target_space,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
        .scalars()
        .all()
    )
    target_ids = {membership.account_id for membership in target_members}
    if requester_account_id not in target_ids:
        raise TransferArchiveError(
            "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
        )
    target_by_email: dict[str, UUID] = {}
    for email, account_id in session.execute(
        select(AccountEmail.email, AccountEmail.account_id).where(
            AccountEmail.account_id.in_(target_ids),
            AccountEmail.verified_at.is_not(None),
        )
    ):
        target_by_email[email] = account_id

    source_ids: set[UUID] = set()
    source_emails: dict[UUID, str | None] = {}
    for member in members:
        if not isinstance(member, dict):
            raise TransferArchiveError(
                "Transfer member metadata is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        source_id = _uuid(member.get("sourceId"), ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
        if source_id in source_ids:
            raise TransferArchiveError(
                "Transfer member metadata is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        source_ids.add(source_id)
        email = member.get("verifiedEmail")
        if email is not None and (
            not isinstance(email, str) or not email or email.lower() != email
        ):
            raise TransferArchiveError(
                "Transfer member metadata is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        source_emails[source_id] = email

    mapping: dict[UUID, UUID] = {}
    for source_id, email in source_emails.items():
        if email is None:
            continue
        target = target_by_email.get(email)
        if target is None:
            continue
        if target in mapping.values():
            raise TransferArchiveError(
                "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        mapping[source_id] = target

    if requester_source_id is not None:
        if requester_source_id not in source_ids:
            raise TransferArchiveError(
                "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        current_target = mapping.get(requester_source_id)
        if current_target is not None and current_target != requester_account_id:
            raise TransferArchiveError(
                "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        source_for_requester = next(
            (source for source, target in mapping.items() if target == requester_account_id), None
        )
        if source_for_requester is not None and source_for_requester != requester_source_id:
            raise TransferArchiveError(
                "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        mapping[requester_source_id] = requester_account_id

    remaining_sources = source_ids - mapping.keys()
    remaining_targets = target_ids - set(mapping.values())
    if len(remaining_sources) == 1 and len(remaining_targets) == 1:
        mapping[next(iter(remaining_sources))] = next(iter(remaining_targets))
        remaining_sources = set()
    if remaining_sources:
        raise TransferArchiveError(
            "Transfer member mapping is required.", ErrorCode.TRANSFER_MEMBER_MAPPING_REQUIRED
        )
    return source_ids, mapping


def _validate_media(
    scope: TransferScope,
    personal_owner: UUID | None,
    source_member_ids: set[UUID],
    tables: dict[str, list[dict[str, Any]]],
    media: list[dict[str, Any]],
    archive_names: set[str],
) -> None:
    referenced: set[UUID] = set()
    for raw in tables.get("memory_attachments", []):
        row = _row_snake(raw)
        referenced.add(_uuid(row.get("attachment_id"), ErrorCode.TRANSFER_RELATION_INVALID))
    for raw in tables.get("heart_moments", []):
        row = _row_snake(raw)
        if row.get("attachment_id") is not None:
            referenced.add(_uuid(row["attachment_id"], ErrorCode.TRANSFER_RELATION_INVALID))
    for raw in tables.get("related_persons", []):
        row = _row_snake(raw)
        if row.get("avatar_attachment_id") is not None:
            referenced.add(_uuid(row["avatar_attachment_id"], ErrorCode.TRANSFER_RELATION_INVALID))
    indexed: set[UUID] = set()
    for item in media:
        source_id = _uuid(item.get("sourceId"), ErrorCode.TRANSFER_RELATION_INVALID)
        owner_id = _uuid(item.get("ownerSourceId"), ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
        if source_id in indexed or source_id not in referenced or owner_id not in source_member_ids:
            raise TransferArchiveError(
                "Transfer media relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
            )
        indexed.add(source_id)
        variants = item.get("variants")
        if (
            not isinstance(variants, list)
            or "original" not in variants
            or any(variant not in {"original", "thumbnail"} for variant in variants)
        ):
            raise TransferArchiveError(
                "Transfer media relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
            )
        for variant in variants:
            if f"media/{source_id}/{variant}" not in archive_names:
                raise TransferArchiveError(
                    "Transfer media relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
                )
    if indexed != referenced:
        raise TransferArchiveError(
            "Transfer media relation is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
        )
    # Media existence is inherited from an included parent, not the attachment
    # row's internal OWNER_ONLY staging class. No orphan media is accepted.
    del scope, personal_owner


def _validate_domain_schema_and_links(
    session: Session,
    *,
    source_space_id: UUID,
    tables: dict[str, list[dict[str, Any]]],
    ids: dict[str, set[UUID]],
    source_member_ids: set[UUID],
    media_ids: set[UUID],
) -> None:
    """Validate reflected v1 table schemas and every declared FK before apply."""
    metadata = MetaData()
    for table_name, json_rows in tables.items():
        table = _table(session, table_name, metadata)
        known = set(table.c.keys())
        required = {
            column.name
            for column in table.c
            if column.primary_key
            or (
                not column.nullable
                and column.default is None
                and column.server_default is None
                and column.autoincrement is not True
            )
        }
        for raw in json_rows:
            row = _row_snake(raw)
            if set(row) - known or required - set(row):
                raise TransferArchiveError(
                    "Transfer domain schema is invalid.",
                    ErrorCode.TRANSFER_RELATION_INVALID,
                )
            if (
                "space_id" in row
                and _uuid(row["space_id"], ErrorCode.TRANSFER_RELATION_INVALID) != source_space_id
            ):
                raise TransferArchiveError(
                    "Transfer tenant relation is invalid.",
                    ErrorCode.TRANSFER_RELATION_INVALID,
                )
            for foreign_key in table.foreign_keys:
                column_name = foreign_key.parent.name
                value = row.get(column_name)
                if value is None:
                    continue
                target_table = foreign_key.column.table.name
                value_id = _uuid(value, ErrorCode.TRANSFER_RELATION_INVALID)
                if target_table == "spaces":
                    valid = value_id == source_space_id
                elif target_table == "accounts":
                    valid = value_id in source_member_ids
                elif target_table == "attachments":
                    valid = value_id in media_ids
                elif target_table in ids:
                    valid = value_id in ids[target_table]
                else:
                    # An allowlisted table must never acquire a new runtime or
                    # security FK without an explicit portability decision.
                    valid = False
                if not valid:
                    raise TransferArchiveError(
                        "Transfer relation is invalid.",
                        ErrorCode.TRANSFER_RELATION_INVALID,
                    )

    generated_sources = {
        "IMPORTANT_DATE": "important_dates",
        "RELATED_PERSON": "related_persons",
        "RELATIONSHIP": "space_profiles",
        "PLAN": "plans",
    }
    for raw in tables.get("reminders", []):
        row = _row_snake(raw)
        if row.get("source") != "GENERATED":
            continue
        source_type = str(row.get("source_type"))
        reminder_target_table = generated_sources.get(source_type)
        if reminder_target_table is None:
            raise TransferArchiveError(
                "Transfer reminder relation is invalid.",
                ErrorCode.TRANSFER_RELATION_INVALID,
            )
        if _uuid(row.get("source_id"), ErrorCode.TRANSFER_RELATION_INVALID) not in ids.get(
            reminder_target_table, set()
        ):
            raise TransferArchiveError(
                "Transfer reminder relation is invalid.",
                ErrorCode.TRANSFER_RELATION_INVALID,
            )


def validate_import_bundle(
    session: Session,
    authorization: AuthorizationContext,
    fileobj: IO[bytes],
    *,
    compressed_size: int,
) -> ValidatedGraph:
    fileobj.seek(0)
    validated_zip = validate_zip(fileobj, compressed_size=compressed_size)
    fileobj.seek(0)
    special, tables, media = _load_documents(fileobj)
    manifest = special["manifest"]
    accounts = special["accounts"]
    try:
        scope = TransferScope(str(manifest["scope"]))
    except ValueError:
        raise TransferArchiveError(
            "Transfer privacy scope is invalid.", ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID
        ) from None
    source_space = _uuid(manifest.get("sourceSpaceId"), ErrorCode.TRANSFER_MANIFEST_INVALID)
    personal_owner: UUID | None = None
    if scope is TransferScope.PERSONAL:
        personal_owner = _uuid(
            manifest.get("personalOwnerSourceId"), ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID
        )
    exported_by_raw = manifest.get("exportedBySourceId")
    exported_by = (
        _uuid(exported_by_raw, ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
        if exported_by_raw is not None
        else None
    )
    if personal_owner is not None and exported_by is not None and personal_owner != exported_by:
        raise TransferArchiveError(
            "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
        )
    requester_source_id = exported_by or personal_owner
    source_members, mapping = _active_target_mapping(
        session,
        authorization.space_id,
        authorization.account_id,
        accounts,
        requester_source_id,
    )
    if personal_owner is not None and (
        personal_owner not in source_members
        or mapping.get(personal_owner) != authorization.account_id
    ):
        raise TransferArchiveError(
            "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
        )
    ids = _validate_ids_and_privacy(scope, personal_owner, tables, source_members)
    _validate_relations(tables, ids)
    _validate_media(
        scope,
        personal_owner,
        source_members,
        tables,
        media,
        set(validated_zip.entries),
    )
    media_ids = {_uuid(item.get("sourceId"), ErrorCode.TRANSFER_RELATION_INVALID) for item in media}
    _validate_domain_schema_and_links(
        session,
        source_space_id=source_space,
        tables=tables,
        ids=ids,
        source_member_ids=source_members,
        media_ids=media_ids,
    )
    counts = {
        file_name.removesuffix(".json"): sum(
            len(tables.get(table_name, [])) for table_name in table_names
        )
        for file_name, table_names in FILE_TABLES.items()
        if any(tables.get(table_name) for table_name in table_names)
    }
    summary: dict[str, object] = {
        "scope": scope.value,
        "recordCounts": counts,
        "mediaCount": len(media),
        "sourceMemberCount": len(source_members),
    }
    return ValidatedGraph(
        scope=scope,
        source_space_id=source_space,
        personal_owner_source_id=personal_owner,
        mapping=mapping,
        tables=tables,
        media=media,
        summary=summary,
    )


def _column_value(column: Any, value: Any) -> Any:
    if value is None:
        return None
    try:
        python_type = column.type.python_type
    except (AttributeError, NotImplementedError):
        return value
    if isinstance(python_type, type) and issubclass(python_type, BaseModel):
        return python_type.model_validate(value)
    if python_type is UUID and not isinstance(value, UUID):
        return UUID(str(value))
    if python_type is datetime and isinstance(value, str):
        return datetime.fromisoformat(value)
    if python_type is date and not isinstance(value, date) and isinstance(value, str):
        return date.fromisoformat(value)
    if python_type is time and not isinstance(value, time) and isinstance(value, str):
        return time.fromisoformat(value)
    return value


def _new_id_map(graph: ValidatedGraph) -> dict[UUID, UUID]:
    result: dict[UUID, UUID] = {}
    for rows in graph.tables.values():
        for raw in rows:
            row = _row_snake(raw)
            if row.get("id") is not None:
                result[_uuid(row["id"], ErrorCode.TRANSFER_RELATION_INVALID)] = new_id()
    for item in graph.media:
        result[_uuid(item["sourceId"], ErrorCode.TRANSFER_RELATION_INVALID)] = new_id()
    return result


def _remap_uuid(
    raw: Any,
    *,
    source_space: UUID,
    target_space: UUID,
    members: Mapping[UUID, UUID],
    ids: Mapping[UUID, UUID],
) -> Any:
    if raw is None:
        return None
    try:
        value = UUID(str(raw))
    except (ValueError, TypeError, AttributeError):
        return raw
    if value == source_space:
        return target_space
    if value in members:
        return members[value]
    if value in ids:
        return ids[value]
    return value


def _prepare_row(
    table: Table,
    raw: Mapping[str, Any],
    *,
    graph: ValidatedGraph,
    authorization: AuthorizationContext,
    ids: Mapping[UUID, UUID],
) -> dict[str, Any]:
    row = _row_snake(raw)
    result: dict[str, Any] = {}
    for name, value in row.items():
        if name not in table.c:
            raise TransferArchiveError(
                "Transfer domain schema is invalid.", ErrorCode.TRANSFER_RELATION_INVALID
            )
        if name == "space_id":
            value = authorization.space_id
        elif name in ACCOUNT_REFERENCE_COLUMNS:
            source = _uuid(value, ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
            if source not in graph.mapping:
                raise TransferArchiveError(
                    "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
                )
            value = graph.mapping[source]
        elif name == "id":
            source = _uuid(value, ErrorCode.TRANSFER_RELATION_INVALID)
            value = ids[source]
        elif name.endswith("_id") or name == "target_id":
            value = _remap_uuid(
                value,
                source_space=graph.source_space_id,
                target_space=authorization.space_id,
                members=graph.mapping,
                ids=ids,
            )
        result[name] = _column_value(table.c[name], value)
    return result


def apply_import_bundle(
    session: Session,
    authorization: AuthorizationContext,
    transfer: TransferImport,
    fileobj: IO[bytes],
) -> list[str]:
    """Revalidate then add the complete graph in the caller's transaction.

    Returns target MediaStore keys written before the DB commit so the caller
    can delete them if the transaction fails.
    """
    graph = validate_import_bundle(
        session,
        authorization,
        fileobj,
        compressed_size=transfer.artifact_size,
    )
    if transfer.member_mapping != {str(key): str(value) for key, value in graph.mapping.items()}:
        raise TransferArchiveError(
            "Transfer member mapping changed.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
        )
    ids = _new_id_map(graph)

    # SpaceProfile is a singleton on the target Space. Additive import must not
    # replace it, but generated relationship reminders may refer to its source
    # ID. Reuse the existing target ID so those references remain valid.
    existing_profile_id = session.execute(
        select(SpaceProfile.id).where(SpaceProfile.space_id == authorization.space_id)
    ).scalar_one_or_none()
    source_profiles = graph.tables.get("space_profiles", [])
    if existing_profile_id is not None and source_profiles:
        source_profile_id = _uuid(source_profiles[0].get("id"), ErrorCode.TRANSFER_RELATION_INVALID)
        ids[source_profile_id] = existing_profile_id

    metadata = MetaData()
    tables = {
        name: _table(session, name, metadata) for names in FILE_TABLES.values() for name in names
    }
    partner_profile_table = tables["partner_profiles"]
    existing_partner_profiles = {
        owner_id: profile_id
        for owner_id, profile_id in session.execute(
            select(partner_profile_table.c.owner_id, partner_profile_table.c.id).where(
                partner_profile_table.c.space_id == authorization.space_id
            )
        )
    }
    reused_partner_profiles: set[UUID] = set()
    for raw in graph.tables.get("partner_profiles", []):
        row = _row_snake(raw)
        source_profile_id = _uuid(row.get("id"), ErrorCode.TRANSFER_RELATION_INVALID)
        source_owner_id = _uuid(row.get("owner_id"), ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
        target_owner_id = graph.mapping.get(source_owner_id)
        if target_owner_id is None:
            raise TransferArchiveError(
                "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
            )
        target_profile_id = existing_partner_profiles.get(target_owner_id)
        if target_profile_id is not None:
            ids[source_profile_id] = target_profile_id
            reused_partner_profiles.add(source_profile_id)

    attachment_table = _table(session, "attachments", metadata)
    store = get_media_store()
    written_keys: list[str] = []

    # Copy media first under newly assigned target IDs. It is not readable
    # through the application until matching Attachment rows commit. Any later
    # failure removes the provider objects before the exception escapes.
    try:
        fileobj.seek(0)
        with ZipFile(fileobj, mode="r") as archive:
            for item in graph.media:
                source_id = _uuid(item["sourceId"], ErrorCode.TRANSFER_RELATION_INVALID)
                target_id = ids[source_id]
                owner_source = _uuid(
                    item["ownerSourceId"], ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
                )
                target_owner = graph.mapping[owner_source]
                for variant in item["variants"]:
                    key = build_storage_key(authorization.space_id, target_id, variant)
                    entry_name = f"media/{source_id}/{variant}"
                    with archive.open(entry_name, "r") as source:
                        store.put(
                            key, source, str(item.get("mimeType") or "application/octet-stream")
                        )
                    written_keys.append(key)
                moment = now()
                attachment_values = {
                    "id": target_id,
                    "space_id": authorization.space_id,
                    "owner_id": target_owner,
                    "privacy_class": PrivacyClass.OWNER_ONLY.value,
                    "status": AttachmentStatus.READY.value,
                    "media_type": item["mediaType"],
                    "declared_mime_type": item["mimeType"],
                    "declared_size": int(item["size"]),
                    "mime_type": item["mimeType"],
                    "size": int(item["size"]),
                    "width": item.get("width"),
                    "height": item.get("height"),
                    "duration_seconds": item.get("durationSeconds"),
                    "has_thumbnail": "thumbnail" in item["variants"],
                    "failure_code": None,
                    "ready_at": moment,
                    "failed_at": None,
                    "uploaded_at": moment,
                    "payload": {
                        "original_name": "eimir-transfer",
                        "captured_at": item.get("capturedAt"),
                        "orientation": item.get("orientation"),
                    },
                    "version": 1,
                }
                session.execute(
                    attachment_table.insert().values(
                        **protect_values("attachments", attachment_values)
                    )
                )

        for table_name in INSERT_ORDER:
            table = tables[table_name]
            for raw in graph.tables.get(table_name, []):
                # The target Space and active memberships already own their
                # singleton profile rows. Reuse those IDs so imported
                # preferences/reminders can reference them without violating
                # the target's uniqueness constraints.
                if table_name == "space_profiles" and existing_profile_id is not None:
                    continue
                if (
                    table_name == "partner_profiles"
                    and _uuid(raw.get("id"), ErrorCode.TRANSFER_RELATION_INVALID)
                    in reused_partner_profiles
                ):
                    continue
                values = _prepare_row(
                    table,
                    raw,
                    graph=graph,
                    authorization=authorization,
                    ids=ids,
                )
                session.execute(table.insert().values(**protect_values(table_name, values)))
    except Exception:
        for key in reversed(written_keys):
            try:
                store.delete(key)
            except OSError:
                _log.warning("transfer media rollback cleanup failed")
        raise
    return written_keys


def cleanup_expired(session: Session, *, at: datetime | None = None) -> int:
    cutoff = at or now()
    store = get_media_store()
    count = 0
    exports = session.execute(
        select(TransferExport).where(
            TransferExport.expires_at <= cutoff,
            TransferExport.status != ExportStatus.EXPIRED.value,
        )
    ).scalars()
    for transfer_export in exports:
        store.delete(export_storage_key(transfer_export))
        transfer_export.status = ExportStatus.EXPIRED.value
        transfer_export.artifact_size = None
        count += 1
    imports = session.execute(
        select(TransferImport).where(
            TransferImport.expires_at <= cutoff,
            TransferImport.status.not_in(
                [ImportStatus.EXPIRED.value, ImportStatus.COMPLETED.value]
            ),
        )
    ).scalars()
    for transfer_import in imports:
        store.delete(import_storage_key(transfer_import))
        transfer_import.status = ImportStatus.EXPIRED.value
        count += 1
    return count
