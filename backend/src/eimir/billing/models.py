"""Opaque purchase references that bind a store purchase to Account and Space."""

from __future__ import annotations

import uuid
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class StoreChannel(StrEnum):
    """App-store purchase channels. Values equal the entitlement source type."""

    GOOGLE_PLAY = "GOOGLE_PLAY"
    # Prepared for the iOS launch; no adapter is connected yet.
    APP_STORE = "APP_STORE"


class StorePlan(StrEnum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class StorePurchaseReference(IdMixin, TimestampMixin, Base):
    """The only identifier a store receives with a purchase.

    The random ``reference`` travels as Google Play's obfuscated account ID (and
    later as Apple's ``appAccountToken``). It carries no name, e-mail address,
    Account ID or relationship content; only this table resolves it to the
    sponsoring Account and the Space the purchase unlocks. One reference exists
    per Account, Space and store, so restore finds the same binding again.
    """

    __tablename__ = "store_purchase_references"

    reference: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    store: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (
        CheckConstraint("store IN ('GOOGLE_PLAY', 'APP_STORE')", name="store_is_known"),
        UniqueConstraint(
            "account_id", "space_id", "store", name="uq_store_purchase_references_binding"
        ),
    )
