"""Operator export: write one deterministic bundle of a Space to a file on disk."""

from __future__ import annotations

import contextlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import MetaData, Table, and_, or_, select
from sqlalchemy.orm import Session

from eimir.appearance import service as appearance_service
from eimir.appearance.models import DEFAULT_WIR_DESIGN
from eimir.attachments.documents import display_name
from eimir.attachments.models import AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.core.errors import BadRequestError, ErrorCode
from eimir.identity.models import Account, AccountEmail
from eimir.media import build_storage_key, get_media_store
from eimir.relationship.models import Membership, MembershipStatus
from eimir_pro.portability import garden
from eimir_pro.portability.allowlist import (
    CHILD_PARENT,
    FILE_TABLES,
    OPTIONAL_TABLES,
    PRIVATE_FILES,
    PRIVATE_ROOTS,
    RELATION_REQUIREMENTS,
)
from eimir_pro.portability.archive import (
    DEFAULT_LIMITS,
    BundleLimits,
    ExportWriter,
    json_bytes,
    manifest_bytes,
    validate_zip,
)
from eimir_pro.portability.common import (
    PortabilityError,
    TransferScope,
    _json_row,
    _json_value,
    _table,
)
from eimir_pro.portability.payload_boundary import reveal_row

APPLICATION_VERSION = "0.1.0"


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
    source_tables = {
        "MEMORY": "memories",
        "HEART_MOMENT": "heart_moments",
        "MILESTONE": "milestones",
        "CHAPTER": "chapters",
        "PLAN": "plans",
    }
    versions = {
        kind: {row["id"]: row.get("version") for row in rows.get(table, [])}
        for kind, table in source_tables.items()
    }
    stale_editions = set()
    kept_sources = []
    for ref in rows.get("recap_sources", []):
        current = versions.get(ref["kind"], {}).get(ref["source_id"])
        if current != ref["source_version"]:
            stale_editions.add(ref["edition_id"])
        if current is not None:
            kept_sources.append(ref)
    rows["recap_sources"] = kept_sources
    for recap in rows.get("recap_editions", []):
        if recap["id"] in stale_editions:
            recap["payload"] = {"headline": None, "introduction": None}
            recap["generated_by"] = "RULES"
    edition_ids = _selected_ids(rows, "recap_editions")
    rows["recap_reflections"] = [
        row for row in rows.get("recap_reflections", []) if row["edition_id"] in edition_ids
    ]
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
        "PLAN": _selected_ids(rows, "plans"),
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
    garden_present = garden.available(session)

    for table_name in all_tables:
        if table_name in CHILD_PARENT or table_name in RELATION_REQUIREMENTS:
            continue
        if table_name in OPTIONAL_TABLES and not garden_present:
            rows[table_name] = []
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
    garden.prune_export(session, authorization.space_id, rows)
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
    attachment_ids.update(
        row["cover_attachment_id"]
        for row in rows.get("plans", [])
        if isinstance(row.get("cover_attachment_id"), UUID)
    )
    attachment_ids.update(
        row["attachment_id"]
        for table_name in ("plan_attachments", "plan_file_attachments", "heart_moment_attachments")
        for row in rows.get(table_name, [])
        if isinstance(row.get("attachment_id"), UUID)
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
                "isSensitive": (item.get("payload") or {}).get("is_sensitive", False),
                **(
                    {"originalName": display_name(item["payload"]["original_name"])}
                    if item["media_type"] == MediaType.DOCUMENT
                    else {}
                ),
            }
        )
    found = {UUID(item["sourceId"]) for item in result}
    # A domain relation must never be exported with a missing/non-ready media
    # target: silently keeping the relation would manufacture a broken graph.
    missing = attachment_ids - found
    if missing:
        raise BadRequestError("Portable media is not ready.", ErrorCode.TRANSFER_EXPORT_FAILED)
    return sorted(result, key=lambda item: item["sourceId"])


@dataclass(frozen=True)
class ExportResult:
    """Content-free facts about a finished export, safe to print."""

    path: Path
    size: int
    scope: TransferScope
    entry_count: int
    media_count: int
    record_counts: dict[str, int]


def export_to_file(
    session: Session,
    authorization: AuthorizationContext,
    scope: TransferScope,
    destination: Path,
    *,
    limits: BundleLimits = DEFAULT_LIMITS,
    schema_revision: str | None = None,
) -> ExportResult:
    """Write one deterministic snapshot bundle to ``destination`` on disk.

    The file is the complete plaintext of the exported data, readable by anyone who can
    read the path. It is created owner-only, written under a ``.part`` name and moved to
    its final name only after the finished archive passed the reader's own validation with
    the same limits. An existing file is never replaced, and no partial file is left behind.
    """
    destination = Path(destination)
    if destination.exists():
        raise PortabilityError("The output file exists already; choose a new name.")
    part = destination.with_name(destination.name + ".part")
    try:
        descriptor = os.open(
            part, os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600
        )
    except FileExistsError:
        raise PortabilityError(
            "A leftover partial output file exists; remove it before exporting again."
        ) from None
    except OSError as error:
        raise PortabilityError(f"The output file cannot be created ({error.strerror}).") from None
    try:
        with os.fdopen(descriptor, "w+b") as output:
            summary = _write_export_archive(
                session, authorization, scope, output, limits, schema_revision
            )
            output.flush()
            size = output.tell()
            output.seek(0)
            validated = validate_zip(output, compressed_size=size, limits=limits)
        # A hard link fails when the name was taken meanwhile, where a rename could replace it.
        try:
            os.link(part, destination)
        except FileExistsError:
            raise PortabilityError("The output file exists already; choose a new name.") from None
    finally:
        with contextlib.suppress(OSError):
            part.unlink()
    return ExportResult(
        path=destination,
        size=size,
        scope=scope,
        entry_count=len(validated.entries),
        media_count=summary.media_count,
        record_counts=summary.record_counts,
    )


@dataclass(frozen=True)
class _ArchiveSummary:
    media_count: int
    record_counts: dict[str, int]


def _wish_selection_snapshot(
    session: Session, authorization: AuthorizationContext, *, personal: bool
) -> dict[str, Any] | None:
    """Export-only state of the current wish selection; import never recreates consent."""
    from eimir.wish_selections.service import get_selection

    projection = get_selection(session, authorization)
    if projection.round is None:
        return None
    # Date ideas are exported as persistent catalog references only. The
    # protected catalog copy is never part of an export, entitled or not.
    result: dict[str, Any] = {
        "occasion": projection.round.payload.title,
        "wishIds": [str(candidate.wish.id) for candidate in projection.candidates],
        "commonWishIds": [str(item) for item in projection.common_wish_ids],
        "dateIdeaIds": [idea.date_idea_id for idea in projection.date_idea_candidates],
        "commonDateIdeaIds": list(projection.common_date_idea_ids),
    }
    if personal:
        result["resultState"] = projection.result_state
        eligible = {candidate.wish.id for candidate in projection.candidates}
        eligible_ideas = {idea.date_idea_id for idea in projection.date_idea_candidates}
        own = projection.own
        result["ownSelection"] = {
            "favoriteWishIds": [
                str(item) for item in own.payload.favorite_wish_ids if item in eligible
            ]
            if own
            else [],
            "favoriteDateIdeaIds": [
                item for item in own.payload.favorite_date_idea_ids if item in eligible_ideas
            ]
            if own
            else [],
            "published": own.published if own else False,
        }
    return result


def _personal_settings_snapshot(
    session: Session, account_id: UUID, space_id: UUID
) -> dict[str, Any]:
    """Export-only view of the owner's saved choices for the personal bundle."""
    from eimir.personal_settings.models import SCHEMA_VERSION, AccountSettings, SpaceSettings
    from eimir.personal_settings.service import read_document, settings_of

    def portable(settings: Any) -> dict[str, Any]:
        converted: dict[str, Any] = {}
        for name, value in settings.stored().items():
            head, *rest = name.split("_")
            converted[head + "".join(part.capitalize() for part in rest)] = value
        return converted

    account = settings_of(read_document(session, account_id, None), AccountSettings)
    space = settings_of(read_document(session, account_id, space_id), SpaceSettings)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "account": portable(account),
        "space": portable(space),
    }


def _photo_source_document(session: Session, authorization: AuthorizationContext) -> dict[str, Any]:
    """The member's photo-source markers and Google hint (never credentials).

    The tool reads the Pro tables directly; Core needs no export hook for them.
    """
    from eimir_pro.photo_sources.models import GoogleAccountHint, PhotoConnection

    document: dict[str, Any] = {}
    connections = session.scalars(
        select(PhotoConnection).where(PhotoConnection.account_id == authorization.account_id)
    ).all()
    document["personalPhotoSources"] = [
        {"source": row.provider, "origin": row.payload.origin}
        for row in connections
        if row.payload.account_id == authorization.account_id
    ]
    google_account = session.scalar(
        select(GoogleAccountHint).where(GoogleAccountHint.account_id == authorization.account_id)
    )
    if google_account and google_account.payload.account_id == authorization.account_id:
        document["personalGoogleAccountHint"] = google_account.payload.email
    return document


def _support_reports_document(
    session: Session, authorization: AuthorizationContext
) -> list[dict[str, Any]]:
    """The requester's own support reports with the reply each one received (#2245).

    Reports belong to an Account, not to a Space, so they are selected by the requesting
    account alone and never by Space. Another person's reports cannot match. The operator's
    ticket link (``support_report_tickets``) and the archive marker are deliberately not
    read. Payloads are decrypted like every other protected table; the import ignores this
    export-only document.
    """
    metadata = MetaData()
    reports = _table(session, "support_reports", metadata)
    replies = _table(session, "support_report_replies", metadata)
    rows = (
        session.execute(
            select(reports)
            .where(reports.c.account_id == authorization.account_id)
            .order_by(reports.c.created_at, reports.c.id)
        )
        .mappings()
        .all()
    )
    document: list[dict[str, Any]] = []
    for row in rows:
        report = reveal_row("support_reports", dict(row))
        # The operator's archive marker is internal bookkeeping, not the person's data.
        report.pop("archived_at", None)
        reply_row = (
            session.execute(select(replies).where(replies.c.report_id == report["id"]))
            .mappings()
            .one_or_none()
        )
        reply = (
            _json_row(reveal_row("support_report_replies", dict(reply_row)))
            if reply_row is not None
            else None
        )
        document.append({**_json_row(report), "reply": reply})
    return document


def _gentle_prompts_document(
    session: Session, authorization: AuthorizationContext
) -> dict[str, Any]:
    from eimir.engagement.models import GentleMemoryExclusion, GentleProfile

    profile = session.get(GentleProfile, authorization.account_id)
    account = session.get(Account, authorization.account_id)
    return {
        "enabled": bool(account and account.gentle_prompts_enabled),
        "observations": profile.observations if profile else [],
        "lastUseAt": profile.last_use_at.isoformat() if profile and profile.last_use_at else None,
        "lastSaveAt": profile.last_save_at.isoformat()
        if profile and profile.last_save_at
        else None,
        "intervalDays": profile.interval_days if profile else None,
        "windows": profile.windows if profile else [],
        "excludedMemoryIds": [
            str(identifier)
            for identifier in session.scalars(
                select(GentleMemoryExclusion.memory_id).where(
                    GentleMemoryExclusion.account_id == authorization.account_id,
                    GentleMemoryExclusion.space_id == authorization.space_id,
                )
            )
        ],
    }


def _write_export_archive(
    session: Session,
    authorization: AuthorizationContext,
    scope: TransferScope,
    output: IO[bytes],
    limits: BundleLimits,
    schema_revision: str | None,
) -> _ArchiveSummary:
    rows = _portable_rows(session, authorization, scope)
    media = _media_rows(session, rows)
    accounts = _source_accounts(session, authorization.space_id)
    checksums: dict[str, str] = {}
    store = get_media_store()
    record_counts: dict[str, int] = {}
    with ZipFile(output, mode="w", compression=ZIP_DEFLATED, allowZip64=True) as archive:
        writer = ExportWriter(archive, output, limits)
        account_document: dict[str, Any] = {"members": accounts}
        selection_snapshot = _wish_selection_snapshot(
            session, authorization, personal=scope is TransferScope.PERSONAL
        )
        if selection_snapshot is not None:
            # Export-only decision state. Import never reactivates choices or
            # treats a downloaded archive as a participant's consent.
            account_document["wishSelection"] = selection_snapshot
        if scope is TransferScope.PERSONAL:
            preference = appearance_service.read_preference(session, authorization)
            account_document["personalAppearance"] = {
                "appIconId": preference.icon_id if preference else "original",
                "wirDesign": (preference.wir_design if preference else DEFAULT_WIR_DESIGN.value),
            }
            if preference is not None and preference.person_colours:
                account_document["personalAppearance"]["personColours"] = preference.person_colours
            if preference is not None and (palette := preference.effective_palette) is not None:
                account_document["personalAppearance"]["designPalette"] = palette.value
            account_document["personalSettings"] = _personal_settings_snapshot(
                session, authorization.account_id, authorization.space_id
            )
            account_document.update(_photo_source_document(session, authorization))
            account_document["personalGentlePrompts"] = _gentle_prompts_document(
                session, authorization
            )
            account_document["personalSupportReports"] = _support_reports_document(
                session, authorization
            )
        # Connection credentials and transient selections are never portable.
        # Personal appearance is export-only metadata. Import never activates
        # paid choices or changes an installation based on untrusted bundles.
        writer.add_json("accounts.json", json_bytes(account_document, limits), checksums)
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
                writer.add_json(file_name, json_bytes(document, limits), checksums)
                record_counts[file_name.removesuffix(".json")] = sum(
                    len(group["rows"]) for group in document["tables"]
                )

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
                    writer.add_media(entry_name, source, checksums)
                stored_variants.append(variant)
            media_index.append({**item, "variants": stored_variants})
        if media_index:
            writer.add_json(
                "media/index.json", json_bytes({"items": media_index}, limits), checksums
            )

        writer.add_json(
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
                schema_revision=schema_revision,
                limits=limits,
            ),
            checksums,
        )
    return _ArchiveSummary(media_count=len(media_index), record_counts=record_counts)
