"""Account-owned credentials and short-lived selected-photo tasks."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field
from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload


class PhotoConnectionPayload(ProtectedPayload):
    account_id: UUID
    origin: str = Field(repr=False)
    api_key: str = Field(repr=False)
    provider_account_id: UUID = Field(repr=False)


class PhotoConnection(IdMixin, VersionMixin, Base):
    __tablename__ = "photo_source_connections"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    payload: Mapped[PhotoConnectionPayload] = mapped_column(
        ProtectedPayloadJSON(PhotoConnectionPayload), nullable=False
    )
    __table_args__ = (UniqueConstraint("account_id", "provider"),)


class SelectedPhotoItem(ProtectedPayload):
    id: str
    source_id: str = Field(repr=False)
    mime_type: str
    source_url: str | None = Field(default=None, repr=False)


class PhotoSelectionPayload(ProtectedPayload):
    selection_id: UUID
    account_id: UUID
    space_id: UUID
    device_session_id: UUID
    oauth_state: str | None = Field(default=None, repr=False)
    code_verifier: str | None = Field(default=None, repr=False)
    access_token: str | None = Field(default=None, repr=False)
    provider_session_id: str | None = Field(default=None, repr=False)
    picker_uri: str | None = Field(default=None, repr=False)
    items: list[SelectedPhotoItem] = Field(default_factory=list, repr=False)
    next_page: int | None = None
    max_items: int = 20


class PhotoSelection(IdMixin, Base):
    __tablename__ = "photo_source_selections"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    device_session_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("device_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    connection_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("photo_source_connections.id", ondelete="CASCADE")
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    state_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_poll_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    payload: Mapped[PhotoSelectionPayload] = mapped_column(
        ProtectedPayloadJSON(PhotoSelectionPayload), nullable=False
    )
    __table_args__ = (
        Index("ix_photo_source_selections_account_id", "account_id"),
        Index("ix_photo_source_selections_expires_at", "expires_at"),
    )
