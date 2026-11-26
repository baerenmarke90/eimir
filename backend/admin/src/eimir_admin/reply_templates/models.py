"""The operator's reply templates (#2327, design section 5.2).

A template is the operator's own text, inserted into a support report reply. It
belongs to no report, Account or Space and is shared by all ServerAdmins of the
instance. The text is plain operator text, not a person's content, so it is
stored unencrypted.
"""

from __future__ import annotations

from sqlalchemy import Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin

TEMPLATE_NAME_MAX = 40
"""The name is the chip label, so it stays short."""
TEMPLATE_TEXT_MAX = 500
"""A template never exceeds what one reply may hold."""
TEMPLATE_LIMIT = 30
"""Enough for a working set; more would make the chip row unusable."""


class SupportReplyTemplate(IdMixin, TimestampMixin, Base):
    """One saved reply text with a short name."""

    __tablename__ = "support_reply_templates"

    name: Mapped[str] = mapped_column(String(TEMPLATE_NAME_MAX), nullable=False)
    text: Mapped[str] = mapped_column(String(TEMPLATE_TEXT_MAX), nullable=False)

    __table_args__ = (
        # Names are unique regardless of case, so "Danke" and "danke" cannot both exist.
        Index("uq_support_reply_templates_name_lower", func.lower(name), unique=True),
    )
