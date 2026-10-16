"""Recurring column patterns for domain objects."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar
from uuid import UUID

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.core.ids import new_id


class IdMixin:
    """UUIDv7 primary key."""

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), primary_key=True, default=new_id
    )


class TimestampMixin:
    """Technical timestamps, always timezone-aware.

    `server_default` and `onupdate` live at the database boundary so writes
    outside the ORM, such as migrations or maintenance scripts, cannot leave
    empty timestamps behind.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


INITIAL_VERSION = 1
"""Version assigned to a newly created object.

Named explicitly because a read response must also be able to report this
state for an object whose row did not previously exist.
"""


class VersionMixin:
    """Optimistic concurrency.

    SQLAlchemy increments the column on every update and checks the version
    read when writing. A mismatch means somebody else wrote in between; that
    must become a 409 rather than a silent overwrite.

    This also prepares for later offline sync: without a version concept, a
    conflict cannot be distinguished from an ordinary change.
    """

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=INITIAL_VERSION)

    __mapper_args__: ClassVar[dict[str, Any]] = {"version_id_col": version}
