"""Persistence for partner profiles and preferences.

`PartnerProfile` is the visible SELF_PROFILE of an account in exactly one
space. Private notes about the partner deliberately are not attached to this
visible profile: they are `ProfilePreference` rows with
`PRIVATE_PARTNER_NOTE` and therefore `OWNER_ONLY`.
"""

from __future__ import annotations

from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    PrivacyClass,
    PrivateResourceMixin,
    ResourceAbsence,
)
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class ProfileVisibility(StrEnum):
    SELF_PROFILE = "SELF_PROFILE"
    PRIVATE_PARTNER_NOTE = "PRIVATE_PARTNER_NOTE"


class PreferenceCategory(StrEnum):
    FOOD = "FOOD"
    DRINK = "DRINK"
    FLOWERS = "FLOWERS"
    MOVIES = "MOVIES"
    SERIES = "SERIES"
    MUSIC = "MUSIC"
    HOBBIES = "HOBBIES"
    ACTIVITIES = "ACTIVITIES"
    TRAVEL = "TRAVEL"
    RESTAURANTS = "RESTAURANTS"
    COLORS = "COLORS"
    OTHER = "OTHER"


class PreferenceSentiment(StrEnum):
    LOVE = "LOVE"
    LIKE = "LIKE"
    NEUTRAL = "NEUTRAL"
    DISLIKE = "DISLIKE"
    AVOID = "AVOID"


class ProfilePreferencePayload(ProtectedPayload):
    """Protected plaintext of a preference.

    Version 1 stores it as JSONB plaintext. The separate payload boundary
    allows later client-side encryption without having to remodel category,
    ownership, or privacy metadata.
    """

    value: str = Field(min_length=1, max_length=2000)


class PartnerNicknamePayload(ProtectedPayload):
    """Viewer-owned relationship label, including an explicit cleared state."""

    nickname: str | None = Field(default=None, max_length=80)


class PartnerProfile(IdMixin, TimestampMixin, PrivateResourceMixin, Base):
    """The SELF_PROFILE of an account that is visible to the partner."""

    __tablename__ = "partner_profiles"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Partner profile not found.", "PARTNER_PROFILE_NOT_FOUND"
    )

    __table_args__ = (
        UniqueConstraint("space_id", "owner_id", name="uq_partner_profiles_space_id_owner_id"),
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
    )


class PartnerNickname(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """One viewer's private name for the other person in this Space."""

    __tablename__ = "partner_nicknames"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[PartnerNicknamePayload] = mapped_column(
        ProtectedPayloadJSON(PartnerNicknamePayload), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("space_id", "owner_id", "account_id", name="uq_partner_nicknames_pair"),
        CheckConstraint("owner_id <> account_id", name="nickname_targets_partner"),
        CheckConstraint("privacy_class = 'OWNER_ONLY'", name="nickname_owner_only"),
        CheckConstraint("crypto_version >= 0", name="nickname_crypto_version_valid"),
    )


class ProfilePreference(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A structured preference about yourself or the partner.

    `owner_id` is the author/owner and `account_id` is the described person.
    The combination with `visibility` is enforced by the database:

    - SELF_PROFILE: author describes themself, SPACE_SHARED, profile FK.
    - PRIVATE_PARTNER_NOTE: author describes the other person, OWNER_ONLY, no
      link to the visible PartnerProfile.
    """

    __tablename__ = "profile_preferences"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Profile preference not found.", "PROFILE_PREFERENCE_NOT_FOUND"
    )

    profile_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("partner_profiles.id", ondelete="CASCADE"),
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    topic: Mapped[str] = mapped_column(String(120), nullable=False)
    sentiment: Mapped[str] = mapped_column(String(16), nullable=False)
    visibility: Mapped[str] = mapped_column(String(32), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[ProfilePreferencePayload] = mapped_column(
        ProtectedPayloadJSON(ProfilePreferencePayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('FOOD', 'DRINK', 'FLOWERS', 'MOVIES', 'SERIES', 'MUSIC', "
            "'HOBBIES', 'ACTIVITIES', 'TRAVEL', 'RESTAURANTS', 'COLORS', 'OTHER')",
            name="category_is_known",
        ),
        CheckConstraint(
            "sentiment IN ('LOVE', 'LIKE', 'NEUTRAL', 'DISLIKE', 'AVOID')",
            name="sentiment_is_known",
        ),
        CheckConstraint(
            "visibility IN ('SELF_PROFILE', 'PRIVATE_PARTNER_NOTE')",
            name="visibility_is_known",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        CheckConstraint(
            "(visibility = 'SELF_PROFILE' AND account_id = owner_id "
            "AND privacy_class = 'SPACE_SHARED' AND profile_id IS NOT NULL) OR "
            "(visibility = 'PRIVATE_PARTNER_NOTE' AND account_id <> owner_id "
            "AND privacy_class = 'OWNER_ONLY' AND profile_id IS NULL)",
            name="visibility_matches_owner_and_privacy",
        ),
        Index(
            "ix_profile_preferences_space_id_account_id_visibility",
            "space_id",
            "account_id",
            "visibility",
        ),
        Index("ix_profile_preferences_owner_id", "owner_id"),
    )


def privacy_for(visibility: ProfileVisibility) -> PrivacyClass:
    """Derive privacy server-side from the domain visibility."""
    if visibility is ProfileVisibility.SELF_PROFILE:
        return PrivacyClass.SPACE_SHARED
    return PrivacyClass.OWNER_ONLY
