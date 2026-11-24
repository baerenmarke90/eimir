"""Schema-version guard: the tool runs only against the schema it was verified against.

The importer writes column by column into Core tables and the exporter reads them, so a
Core migration that adds, removes or re-validates a column can make either side wrong
without any error. The tool therefore reads the Alembic revision of its database and
refuses to run when it is not the revision named below. Whoever changes Core's schema
re-verifies the tool (the probe tests in ``pro_tests``), then moves this revision. The unit
test ``test_schema_guard.py`` fails as soon as the migration chain moves ahead of it.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from eimir_pro.portability.common import PortabilityError

TESTED_ALEMBIC_REVISION = "0176"
"""The Core Alembic head this tool was verified against (export and import probes)."""

_VERSION_TABLE = "alembic_version"


class SchemaRevisionError(PortabilityError):
    """The database is not at the revision this tool was verified against."""


def database_revision(session: Session) -> str | None:
    """The Alembic revision of the database, or ``None`` when it was never migrated."""
    if not inspect(session.get_bind()).has_table(_VERSION_TABLE):
        return None
    revisions = session.execute(text(f"SELECT version_num FROM {_VERSION_TABLE}")).scalars().all()
    if len(revisions) > 1:
        raise SchemaRevisionError(
            "The database reports several Alembic revisions; migrate it to a single head first."
        )
    return str(revisions[0]) if revisions else None


def require_tested_revision(session: Session, *, role: str) -> str:
    """Return the revision when it is the tested one; otherwise refuse with a clear message.

    ``role`` names the database in the message (``source`` or ``target``).
    """
    revision = database_revision(session)
    if revision != TESTED_ALEMBIC_REVISION:
        raise SchemaRevisionError(
            f"The {role} database is at schema revision {revision or 'none'}, but this tool "
            f"was verified against revision {TESTED_ALEMBIC_REVISION}. Migrate the database "
            "or use the tool version that matches it; nothing was read or written."
        )
    return revision
