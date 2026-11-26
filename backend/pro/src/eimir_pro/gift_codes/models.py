"""Gift code batches and their codes (ServerAdmin part 5, design section 5.3).

Both tables are operator data of the Pro plugin and live in its own migration
chain (``alembic_version_pro``); Core knows them only through the plugin
manifest. They are not a couple's content and never leave the instance in an
export. The code itself is stored encrypted; the unique ``lookup_hash`` finds a
code at redemption without decrypting every row. A deleted Space or grant keeps
the code row, so the batch counts stay right, and only drops the link.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload

DURATION_MONTHS = (1, 3, 6, 12)
"""The Pro time one code of a batch gives, in months."""


class GiftCodePayload(ProtectedPayload):
    """The canonical code (``EIMIR-XXXX-XXXX``), shown to the operator only."""

    code: str


class GiftCodeBatch(IdMixin, Base):
    """One creation of codes with the same duration and redemption deadline."""

    __tablename__ = "gift_code_batches"

    note: Mapped[str | None] = mapped_column(String(120))
    """Private operator note; never shown to couples."""
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    redeemable_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )

    __table_args__ = (
        CheckConstraint(
            f"duration_months IN ({', '.join(str(months) for months in DURATION_MONTHS)})",
            name="duration_months_allowed",
        ),
    )


class GiftCode(IdMixin, Base):
    """One code of a batch and what became of it."""

    __tablename__ = "gift_codes"

    batch_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("gift_code_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default=text("0")
    )
    payload: Mapped[GiftCodePayload] = mapped_column(
        ProtectedPayloadJSON(GiftCodePayload), nullable=False
    )
    lookup_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    """Keyed hash of the canonical code; finds the row at redemption."""
    handed_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    redeemed_space_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="SET NULL"),
        index=True,
    )
    redeemed_grant_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("entitlement_grants.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        CheckConstraint(
            "NOT (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL)",
            name="not_redeemed_and_revoked",
        ),
    )
