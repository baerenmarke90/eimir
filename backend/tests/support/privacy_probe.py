"""A minimal resource on which authorization can be exercised.

Deliberately not a product domain. The authorization foundation must apply to
arbitrary future domains, and a test tied to HeartMoments would bind it to that
domain while also creating M2 code before it is approved.

The probe therefore carries exactly what authorization needs: the three
columns from `PrivateResourceMixin` and a text field that makes a leak visible.

The table is attached to `Base.metadata` because its foreign keys point to
`spaces` and `accounts`. It is created exclusively through `create_all` in the
test fixture: `alembic/env.py` imports only production models, so the probe
appears in no migration and no production database.
"""

from __future__ import annotations

from typing import ClassVar

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class PrivacyProbe(IdMixin, TimestampMixin, PrivateResourceMixin, Base):
    __tablename__ = "privacy_probes"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Probe not found.", "PRIVACY_PROBE_NOT_FOUND"
    )

    label: Mapped[str] = mapped_column(String(64), nullable=False)
