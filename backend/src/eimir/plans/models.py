"""Persistence for shared M3 plans."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    UniqueConstraint,
    text,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    PrivacyClass,
    PrivateResourceMixin,
    ResourceAbsence,
    SharedWrite,
)
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class PlanStatus(StrEnum):
    """State machine defined by M3-D04.

    ```text
    IDEA -- schedule --> PLANNED
    IDEA -- complete --> COMPLETED
    PLANNED -- unschedule --> IDEA
    PLANNED -- complete --> COMPLETED
    ```

    ``COMPLETED`` is terminal. ``return-to-wish`` is not an edge of this state
    machine but a separate operation that removes the plan.
    """

    IDEA = "IDEA"
    PLANNED = "PLANNED"
    COMPLETED = "COMPLETED"


def plan_status_type() -> SqlEnum:
    """Column type for ``status``: VARCHAR plus CHECK, matching wishes."""
    return SqlEnum(
        *(status.value for status in PlanStatus),
        name="plan_status",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


class PlanPayload(ProtectedPayload):
    """Protected content of a plan.

    Title and description live behind the protected boundary. Schedule and
    status remain outside because filtering and ordering need them even when the
    server no longer has plaintext content.
    """

    title: str
    description: str | None = None


class Plan(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A shared plan that both partners may read and write.

    A plan is created either from a wish (M3-D02) or directly (M3-D30). The
    distinction is represented by exactly one field, ``source_wish_id``, and
    determines completion effects, ``return-to-wish``, and deletion rules.
    """

    __tablename__ = "plans"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Plan not found.", "PLAN_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    status: Mapped[str] = mapped_column(
        plan_status_type(),
        nullable=False,
        default=PlanStatus.IDEA.value,
        server_default=text("'IDEA'"),
    )
    place_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    """The single primary place for this plan, or none.

    Canonical and single-column by M3-D08/D31: there is deliberately no
    ``place_plans`` table. A plan has at most one place; multiple places would
    create an unordered list the product does not need.
    """

    source_wish_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    """The wish from which this plan originated, or NULL.

    Unique so a wish cannot have two originating plans at the same time.
    PostgreSQL allows multiple NULL values in a UNIQUE constraint, so direct
    plans do not conflict with one another.
    """

    planned_on: Mapped[date | None] = mapped_column(Date)
    """Calendar day for a genuinely date-only schedule, or NULL.

    This is deliberately distinct from ``planned_start``. A date-only Plan is
    not an instant and must therefore never be reconstructed through midnight,
    noon, or another fabricated wall-clock time merely to satisfy a timestamp
    field. Existing timed schedules continue to use ``planned_start``.
    """

    planned_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    planned_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    experienced_on: Mapped[date | None] = mapped_column(Date)
    """Calendar day on which the experience happened, not an instant.

    This is a DATE rather than TIMESTAMPTZ because an experienced calendar day
    has no timezone and would shift if stored as an instant.
    """

    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[PlanPayload] = mapped_column(
        ProtectedPayloadJSON(PlanPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # A schedule has exactly one semantic start representation. Keeping the
        # two columns mutually exclusive makes date-only versus timed explicit
        # at the persistence boundary and prevents timezone inference later.
        CheckConstraint(
            "planned_on IS NULL OR planned_start IS NULL",
            name="schedule_has_single_start",
        ),
        CheckConstraint(
            "planned_end IS NULL OR planned_start IS NOT NULL",
            name="planned_end_needs_start",
        ),
        CheckConstraint(
            "planned_end IS NULL OR planned_end >= planned_start",
            name="planned_end_not_before_start",
        ),
        CheckConstraint(
            "status <> 'IDEA' OR "
            "(planned_on IS NULL AND planned_start IS NULL AND planned_end IS NULL)",
            name="idea_has_no_schedule",
        ),
        CheckConstraint(
            "status <> 'PLANNED' OR "
            "((planned_on IS NOT NULL AND planned_start IS NULL) OR "
            "(planned_on IS NULL AND planned_start IS NOT NULL))",
            name="planned_needs_start",
        ),
        CheckConstraint(
            "status <> 'COMPLETED' OR experienced_on IS NOT NULL",
            name="completed_needs_experienced_on",
        ),
        UniqueConstraint("source_wish_id", name="uq_plans_source_wish_id"),
        # Composite rather than ID-only so a plan cannot point at a wish in a
        # different space. Because ``source_wish_id`` may be NULL and
        # PostgreSQL skips foreign-key validation when one component is NULL,
        # direct plan creation remains unaffected.
        #
        # Deliberately no ON DELETE: a wish with an originating plan must not
        # disappear implicitly. M3-D05 forbids a hidden Wish -> Plan cascade,
        # and the service rejects that case with a domain 409 first.
        ForeignKeyConstraint(
            ["source_wish_id", "space_id"],
            ["wishes.id", "wishes.space_id"],
            name="fk_plans_source_wish_id_wishes",
        ),
        # As with source wish, the composite key prevents references to a place
        # in another space. ``SET NULL`` explicitly names the column: without
        # the column list PostgreSQL would also clear NOT NULL ``space_id``.
        #
        # The place service removes the association first under versioning.
        # This foreign key is defense in depth so a plan never references a
        # place that no longer exists.
        ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_plans_place_id_places",
            ondelete="SET NULL (place_id)",
        ),
        Index("ix_plans_owner_id", "owner_id"),
        Index("ix_plans_place_id", "place_id"),
        Index("ix_plans_space_id_created_at_id", "space_id", "created_at", "id"),
        Index("ix_plans_space_id_status", "space_id", "status"),
        Index("ix_plans_space_id_planned_on", "space_id", "planned_on"),
        Index("ix_plans_space_id_planned_start", "space_id", "planned_start"),
    )


def shared_privacy() -> PrivacyClass:
    """A plan is always shared space content (M3-D01)."""
    return PrivacyClass.SPACE_SHARED
