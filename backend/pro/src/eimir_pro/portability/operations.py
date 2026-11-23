"""The two operator operations: export a Space to a file, import a file into a Space.

No job, no API route, no Transfer table and no Cloud quota or Pro video gate is involved
(Decision 0020). One run touches one database and its media store; the schema guard refuses
a database that is not at the revision the tool was verified against.
"""

from __future__ import annotations

import contextlib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.identity import effects as account_effects
from eimir.media import get_media_store
from eimir_pro.portability.archive import DEFAULT_LIMITS, BundleLimits
from eimir_pro.portability.common import PortabilityError, TransferScope
from eimir_pro.portability.export import ExportResult, export_to_file
from eimir_pro.portability.importer import apply_import_bundle, validate_import_bundle
from eimir_pro.portability.schema_guard import require_tested_revision


@dataclass(frozen=True)
class ImportReport:
    """Content-free facts about an import run, safe to print."""

    dry_run: bool
    summary: dict[str, object]
    written_objects: int


def _member_authorization(
    session: Session, *, space_id: UUID, account_id: UUID
) -> AuthorizationContext:
    if not account_effects.has_active_membership(session, account_id=account_id, space_id=space_id):
        raise PortabilityError("The member is not an active member of the Space.")
    return AuthorizationContext(account_id=account_id, space_id=space_id)


def run_export(
    engine: Engine,
    *,
    space_id: UUID,
    account_id: UUID,
    scope: TransferScope,
    destination: Path,
    limits: BundleLimits = DEFAULT_LIMITS,
) -> ExportResult:
    """Export one Space from the connected (source) database to ``destination``."""
    connection: Connection
    # One repeatable-read transaction gives every query of the archive the same snapshot.
    with (
        engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection,
        Session(bind=connection) as session,
        session.begin(),
    ):
        revision = require_tested_revision(session, role="source")
        authorization = _member_authorization(session, space_id=space_id, account_id=account_id)
        return export_to_file(
            session,
            authorization,
            scope,
            destination,
            limits=limits,
            schema_revision=revision,
        )


def run_import(
    engine: Engine,
    *,
    space_id: UUID,
    account_id: UUID,
    source: Path,
    overrides: Mapping[UUID, UUID] | None = None,
    limits: BundleLimits = DEFAULT_LIMITS,
    dry_run: bool = False,
) -> ImportReport:
    """Validate ``source`` and add what is missing to a Space of the connected (target) database.

    ``account_id`` is the target member who corresponds to the member that ran the export.
    ``overrides`` maps further source members to target members when their verified emails do
    not decide it. With ``dry_run`` the file is validated and planned, and nothing is written.
    """
    try:
        size = source.stat().st_size
    except OSError as error:
        raise PortabilityError(f"The bundle file cannot be read ({error.strerror}).") from None
    if size <= 0:
        raise PortabilityError("The bundle file is empty.")
    with source.open("rb") as fileobj, Session(engine) as session:
        revision = require_tested_revision(session, role="target")
        authorization = _member_authorization(session, space_id=space_id, account_id=account_id)
        if dry_run:
            graph = validate_import_bundle(
                session,
                authorization,
                fileobj,
                compressed_size=size,
                limits=limits,
                overrides=overrides,
                expected_schema_revision=revision,
            )
            session.rollback()
            return ImportReport(dry_run=True, summary=dict(graph.summary), written_objects=0)
        result = apply_import_bundle(
            session,
            authorization,
            fileobj,
            compressed_size=size,
            limits=limits,
            overrides=overrides,
            expected_schema_revision=revision,
        )
        try:
            session.commit()
        except BaseException:
            # The media objects live outside PostgreSQL: a failed commit must revoke them.
            session.rollback()
            store = get_media_store()
            for key in reversed(result.written_keys):
                with contextlib.suppress(OSError):
                    store.delete(key)
            raise
    return ImportReport(
        dry_run=False, summary=result.summary, written_objects=len(result.written_keys)
    )
