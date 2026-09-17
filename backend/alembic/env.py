"""Alembic environment.

The connection comes from the environment rather than alembic.ini because
credentials do not belong in a committed file. Only `DatabaseSettings` is
loaded instead of the complete application configuration: a migration needs
the database, but neither a cursor-signing key nor SMTP nor a public address.
Depending on those would make `alembic upgrade head` fail in production
before the first revision ran.

All models are imported here so `--autogenerate` can see them. A missing
import can produce a migration that tries to drop a table.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from pydantic import ValidationError
from sqlalchemy import CheckConstraint, engine_from_config, pool
from sqlalchemy.schema import SchemaItem

from eimir.administration import models as _administration  # noqa: F401
from eimir.attachments import binding as _binding  # noqa: F401

# Register models. These imports look unused, but they are not.
from eimir.attachments import models as _attachments  # noqa: F401
from eimir.auth import recent_auth_models as _recent_auth  # noqa: F401
from eimir.chapters import models as _chapters  # noqa: F401
from eimir.collections import models as _collections  # noqa: F401
from eimir.comments import models as _comments  # noqa: F401
from eimir.config import DatabaseSettings
from eimir.dashboard import models as _dashboard  # noqa: F401
from eimir.db.base import Base
from eimir.demo import models as _demo  # noqa: F401
from eimir.engagement import models as _engagement  # noqa: F401
from eimir.entitlements import models as _entitlements  # noqa: F401
from eimir.gift_ideas import models as _gift_ideas  # noqa: F401
from eimir.heart_moments import models as _heart_moments  # noqa: F401
from eimir.identity import models as _identity  # noqa: F401
from eimir.jobs import models as _jobs  # noqa: F401
from eimir.memories import models as _memories  # noqa: F401
from eimir.milestones import models as _milestones  # noqa: F401
from eimir.outbox import models as _outbox  # noqa: F401
from eimir.people import models as _people  # noqa: F401
from eimir.places import models as _places  # noqa: F401
from eimir.plans import models as _plans  # noqa: F401
from eimir.private_collections import models as _private_collections  # noqa: F401
from eimir.private_notes import models as _private_notes  # noqa: F401
from eimir.profiles import models as _profiles  # noqa: F401
from eimir.relations import models as _relations  # noqa: F401
from eimir.relationship import models as _relationship  # noqa: F401
from eimir.reminders import models as _reminders  # noqa: F401
from eimir.reminders import runtime_models as _reminder_runtime  # noqa: F401
from eimir.story import view_models as _story_views  # noqa: F401
from eimir.transfer import models as _transfer  # noqa: F401
from eimir.wishes import models as _wishes  # noqa: F401


def _migration_connection() -> str:
    """Return the database URL for this run or fail with a clear diagnostic."""
    try:
        return DatabaseSettings().database_url
    except ValidationError as error:
        raise SystemExit(
            "Migration cannot start: EIMIR_DATABASE_URL is missing or invalid. "
            "Expected a PostgreSQL URL, for example "
            "postgresql+psycopg://user:password@host:5432/database. "
            f"Cause: {error}"
        ) from error


config = context.config
config.set_main_option("sqlalchemy.url", _migration_connection())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _type_bound_checks(table_name: str) -> set[str]:
    """Return CHECK names owned by a column type rather than the table."""
    table = Base.metadata.tables.get(table_name)
    if table is None:
        return set()
    return {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
        and getattr(constraint, "_type_bound", False)
        and constraint.name is not None
    }


def include_object(
    object_: SchemaItem,
    name: str | None,
    type_: str,
    reflected: bool,
    compare_to: SchemaItem | None,
) -> bool:
    """Exclude type-bound CHECK constraints from autogenerate comparison."""
    del compare_to
    if type_ != "check_constraint" or not reflected or name is None:
        return True
    table = getattr(object_, "table", None)
    if table is None:
        return True
    return name not in _type_bound_checks(table.name)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
