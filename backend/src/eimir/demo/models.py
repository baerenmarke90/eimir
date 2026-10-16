"""The durable technical identity of the two canonical demo personas.

`display_name` is presentation state in the domain model (see
`eimir.demo.canonical` and `docs/DEMO-SPACE.md`) and must never again be
the thing create/ensure/reset use to recognize a canonical demo Account
(#633). Public Demo visitors are already prevented from changing it at all
through the normal profile API (#697), but legacy data from before this
marker existed, an operator edit, or a direct database change can still leave
it drifted, and the demo maintenance path must remain recoverable when it
does.

This table is the stable alternative: a private demo-only registry stating
which already-verified reserved-address Account currently plays each
persona. It is keyed by the persona, not by the Account, so at most one
Account can ever hold a given persona, and `account_id` is independently
unique so the reverse also holds. Deliberately its own table rather than a
column on `accounts` so the core identity model stays free of a demo-only
concept, and so the whole invariant can be dropped by a single migration
without touching `accounts`.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import TimestampMixin


class DemoCanonicalIdentity(TimestampMixin, Base):
    """Marks exactly one Account as the current holder of a canonical persona."""

    __tablename__ = "demo_canonical_identities"

    persona: Mapped[str] = mapped_column(String(16), primary_key=True)
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("persona IN ('LEA', 'ALEX')", name="persona_is_known"),
        UniqueConstraint("account_id", name="uq_demo_canonical_identities_account_id"),
    )
