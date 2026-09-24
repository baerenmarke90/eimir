"""Identity persistence.

An Account carries profile identity. Authentication secrets live separately
in AuthIdentity: an account may have multiple ways to authenticate, and none
belongs in the table exposed to a user-facing profile.
"""

from __future__ import annotations

from datetime import date, datetime, time
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin


class AuthProvider(StrEnum):
    """How an account authenticates.

    Cloud uses magic link and passkey without requiring a password.
    Self-hosted additionally permits local password and OIDC so an external
    provider is not a special path later.
    """

    MAGIC_LINK = "MAGIC_LINK"
    PASSKEY = "PASSKEY"
    LOCAL_PASSWORD = "LOCAL_PASSWORD"
    OIDC = "OIDC"


class InstanceBootstrapState(Base):
    """Durable one-time proof for initial registration.

    The secret bootstrap value exists only in runtime configuration. The
    database records only whether initial setup has already completed.
    """

    __tablename__ = "instance_bootstrap_state"

    singleton_key: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
    )

    __table_args__ = (CheckConstraint("singleton_key = 1", name="singleton_key_is_one"),)


class Account(IdMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "accounts"

    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    birthday: Mapped[date | None] = mapped_column(Date)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="de-DE")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Berlin")
    quiet_hours_start: Mapped[time | None] = mapped_column(Time(timezone=False))
    quiet_hours_end: Mapped[time | None] = mapped_column(Time(timezone=False))
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "(quiet_hours_start IS NULL AND quiet_hours_end IS NULL) OR "
            "(quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL "
            "AND quiet_hours_start <> quiet_hours_end "
            "AND EXTRACT(SECOND FROM quiet_hours_start) = 0 "
            "AND EXTRACT(SECOND FROM quiet_hours_end) = 0)",
            name="account_quiet_hours_boundaries_valid",
        ),
    )

    emails: Mapped[list[AccountEmail]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )

    @property
    def is_active(self) -> bool:
        return self.disabled_at is None


class AccountEmail(IdMixin, TimestampMixin, Base):
    """An email address belonging to an account.

    Stored separately from Account because an address can change and because
    verification is state of the address, not of the person.
    """

    __tablename__ = "account_emails"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Persist lowercase. Otherwise "A@b.de" and "a@b.de" would be two
    # addresses and uniqueness would have a gap.
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_primary: Mapped[bool] = mapped_column(nullable=False, default=False)

    account: Mapped[Account] = relationship(back_populates="emails")

    __table_args__ = (
        UniqueConstraint("email", name="uq_account_emails_email"),
        CheckConstraint("email = lower(email)", name="email_is_lowercase"),
    )


class AuthIdentity(IdMixin, TimestampMixin, Base):
    """An authentication method.

    `subject` is the identifier used by the corresponding method. For OIDC a
    subject is unique only together with the issuer; `connection_id` names the
    configured connection, for example ``pocket-id``. `secret_hash` contains
    derived values only, never plaintext secrets.

    Passkeys use a dedicated model because credential ID, public key, and
    signature counter are not properties of a generic identity. MAGIC_LINK
    and PASSKEY remain permitted legacy values so existing installations can
    migrate without data loss.
    """

    __tablename__ = "auth_identities"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(512), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(512))
    connection_id: Mapped[str | None] = mapped_column(String(128))
    secret_hash: Mapped[str | None] = mapped_column(String(255))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # OIDC defines an external identity as (issuer, subject), not subject
        # alone. Different issuers may use the same subject.
        UniqueConstraint("issuer", "subject", name="uq_auth_identities_issuer_subject"),
        CheckConstraint(
            "provider IN ('MAGIC_LINK', 'PASSKEY', 'LOCAL_PASSWORD', 'OIDC')",
            name="provider_is_known",
        ),
        CheckConstraint(
            "(provider = 'OIDC' AND issuer IS NOT NULL AND connection_id IS NOT NULL) "
            "OR (provider <> 'OIDC' AND issuer IS NULL AND connection_id IS NULL)",
            name="oidc_metadata_matches_provider",
        ),
        # Preserve the existing uniqueness rule for every other method.
        # PostgreSQL otherwise permits multiple NULL values in a normal
        # unique constraint.
        Index(
            "uq_auth_identities_non_oidc_provider_subject",
            "provider",
            "subject",
            unique=True,
            postgresql_where=text("provider <> 'OIDC'"),
        ),
        Index("ix_auth_identities_account_id", "account_id"),
    )


class WebAuthnCredential(IdMixin, TimestampMixin, Base):
    """A passkey in the representation required for WebAuthn verification.

    Credential ID and public key are not secrets. Private keys never leave
    the authenticator. The counter and backup metadata are updated after each
    successful assertion and help detect cloned or reset credentials.
    """

    __tablename__ = "webauthn_credentials"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    credential_id: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sign_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    aaguid: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    transports: Mapped[list[str]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    is_discoverable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    backup_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    backup_state: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("credential_id", name="uq_webauthn_credentials_credential_id"),
        CheckConstraint("sign_count >= 0", name="sign_count_is_non_negative"),
        Index("ix_webauthn_credentials_account_id", "account_id"),
    )


class WebAuthnChallenge(IdMixin, Base):
    """The challenge for an active WebAuthn ceremony.

    It is stored in plaintext deliberately because the server must compare it
    with the value in `clientDataJSON`. It is not a secret; its purpose is
    one-time use, enforced by consuming it here.

    `account_id` is set during registration, which starts from an existing
    authenticated session, and is empty for authentication with a
    discoverable passkey where only the response identifies the account.
    """

    __tablename__ = "webauthn_challenges"

    purpose: Mapped[str] = mapped_column(String(16), nullable=False)
    challenge: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("purpose IN ('REGISTRATION', 'AUTHENTICATION')", name="purpose_is_known"),
        Index("ix_webauthn_challenges_expires_at", "expires_at"),
    )


class OneTimeTokenMixin:
    """Shared security invariants without creating a shared token table."""

    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def is_open(self, at: datetime) -> bool:
        return self.consumed_at is None and self.revoked_at is None and self.expires_at > at


class EmailVerificationToken(IdMixin, OneTimeTokenMixin, Base):
    """One-time proof for exactly one email address."""

    __tablename__ = "email_verification_tokens"

    account_email_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("account_emails.id", ondelete="CASCADE"),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_email_verification_tokens_token_hash"),
        Index("ix_email_verification_tokens_account_email_id", "account_email_id"),
        Index("ix_email_verification_tokens_expires_at", "expires_at"),
    )


class MagicLinkToken(IdMixin, OneTimeTokenMixin, Base):
    """One-time passwordless authentication proof for an email address.

    ``is_demo_entry`` splits this table into two independent authority
    domains that happen to share a schema and a consume path. An emailed
    magic link (``is_demo_entry=False``) still supersedes every older open
    link for the same address, one live generation at a time. A public demo
    entry proof (``is_demo_entry=True``) never supersedes anything: separate
    visitors entering the same shared canonical persona get separate proofs
    that must both stay redeemable. The flag is read only by
    ``auth.action_tokens``, which is the sole place that must know the two
    domains cannot invalidate each other; consumption does not branch on it.
    """

    __tablename__ = "magic_link_tokens"

    account_email_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("account_emails.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_demo_entry: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_magic_link_tokens_token_hash"),
        Index("ix_magic_link_tokens_account_email_id", "account_email_id"),
        Index("ix_magic_link_tokens_expires_at", "expires_at"),
    )


class AccountRecoveryToken(IdMixin, OneTimeTokenMixin, Base):
    """One-time recovery proof for an account."""

    __tablename__ = "account_recovery_tokens"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_account_recovery_tokens_token_hash"),
        Index("ix_account_recovery_tokens_account_id", "account_id"),
        Index("ix_account_recovery_tokens_expires_at", "expires_at"),
    )


class SignupProof(IdMixin, OneTimeTokenMixin, Base):
    """One-time proof of control over an address that may not have an Account yet.

    A ``MagicLinkToken`` is bound to an existing ``AccountEmail`` and therefore
    cannot represent an address nobody has registered. Cloud self-service
    onboarding (#923) needs exactly that, so the subject here is the normalized
    address itself. Consumption decides whether the verified person signs into
    the Account that owns the address or whether one is created; the request
    that issued the proof never looks at Account state.

    The address is stored only for the short lifetime of the proof. Security
    retention deletes expired, consumed, and superseded rows, so this table does
    not become a second directory of addresses.
    """

    __tablename__ = "signup_proofs"

    email: Mapped[str] = mapped_column(String(320), nullable=False)

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_signup_proofs_token_hash"),
        CheckConstraint("email = lower(email)", name="email_is_lowercase"),
        Index("ix_signup_proofs_email", "email"),
        Index("ix_signup_proofs_expires_at", "expires_at"),
    )


class OidcAuthRequest(IdMixin, Base):
    """An initiated OIDC authentication request.

    It holds the three values binding the callback to exactly this request:
    state, stored only as a hash because it returns via the browser; nonce;
    and PKCE verifier.

    Nonce and verifier are plaintext deliberately because the server must
    present or compare them itself. They are not authentication proofs but
    bindings, and they live for minutes before the maintenance job removes
    them.
    """

    __tablename__ = "oidc_auth_requests"

    connection_id: Mapped[str] = mapped_column(String(64), nullable=False)
    state_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    nonce: Mapped[str] = mapped_column(String(128), nullable=False)
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(512), nullable=False)

    # Set when an already authenticated account wants to link an external
    # identity to itself.
    account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
    )

    # Set when an account that does not yet exist is to be onboarded through
    # OIDC via an invitation. Like all bearer proofs, stored only as a hash.
    invitation_token_hash: Mapped[str | None] = mapped_column(String(64))

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("state_hash", name="uq_oidc_auth_requests_state_hash"),
        Index("ix_oidc_auth_requests_expires_at", "expires_at"),
    )


class DeviceSession(IdMixin, Base):
    """An authenticated device session.

    Tokens are stored only as hashes. Reading the database therefore does not
    grant authentication; a stolen database is harmful enough without also
    becoming direct account access.

    The session is also the refresh-token family: every token derived from it
    belongs to exactly this row. Consumed generations remain associated in
    `ConsumedRefreshToken`, so an old token appearing later is not merely
    rejected but recognized as compromise.

    Two expiry points have different meanings: `expires_at` is the sliding
    inactivity window, while `absolute_expires_at` is the hard family limit
    from initial authentication. Without the latter, the former could be
    extended indefinitely.
    """

    __tablename__ = "device_sessions"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    device_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="")

    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    access_token_hash: Mapped[str | None] = mapped_column(String(64))
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Sliding: every rotation resets this point. It bounds inactivity, not the
    # total session lifetime.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Fixed from authentication and never moved by rotation. This boundary
    # makes the session and token family finite, including replay history.
    # `expires_at` is never extended beyond it.
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("refresh_token_hash", name="uq_device_sessions_refresh_token_hash"),
        Index("ix_device_sessions_access_token_hash", "access_token_hash"),
        Index("ix_device_sessions_account_id", "account_id"),
    )


class ConsumedRefreshToken(IdMixin, Base):
    """An already consumed refresh-token generation.

    Rotation alone only invalidates an old token. To associate an old token
    that appears after several rotations with its family, and therefore
    recognize theft rather than merely reject it, every consumed generation
    remains here for the session lifetime.

    Only the hash is stored. This table is therefore not a second copy of
    authentication proofs: reading it cannot authenticate or reconstruct a
    token.

    The hash is globally unique. A refresh token therefore belongs to exactly
    one family and replay cannot be made ambiguous by inserting a second row.
    """

    __tablename__ = "consumed_refresh_tokens"

    device_session_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("device_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )

    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    consumed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_consumed_refresh_tokens_token_hash"),
        Index("ix_consumed_refresh_tokens_device_session_id", "device_session_id"),
    )


class RateLimitEvent(IdMixin, Base):
    """A counted rate-limit attempt.

    The key is stored only as a hash. It is often an email address, and who
    attempted authentication when is more information than rate limiting
    needs.
    """

    __tablename__ = "rate_limit_events"

    action: Mapped[str] = mapped_column(String(32), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index(
            "ix_rate_limit_events_action_key_hash_occurred_at",
            "action",
            "key_hash",
            "occurred_at",
        ),
    )
