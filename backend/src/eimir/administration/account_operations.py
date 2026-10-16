"""Privileged, privacy-safe Account operations for ServerAdmin.

This module deliberately exposes only identity and authentication operations.
It is not a content-moderation surface and never loads relationship payloads.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction
from eimir.auth import action_tokens, sessions
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import (
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
)
from eimir.demo import canonical
from eimir.identity import deletion_self_service
from eimir.identity import service as accounts
from eimir.identity.deletion import apply_accepted_tombstone
from eimir.identity.deletion_jobs import enqueue_convergence
from eimir.identity.deletion_journal import DeletionJournal
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.deletion_self_service import SelfDeletionErrorCode
from eimir.identity.models import Account, AccountEmail


class ServerAdminAccountErrorCode:
    NOT_FOUND = "SERVER_ADMIN_ACCOUNT_NOT_FOUND"
    EMAIL_NOT_FOUND = "SERVER_ADMIN_EMAIL_NOT_FOUND"
    CONFIRMATION_MISMATCH = "SERVER_ADMIN_CONFIRMATION_MISMATCH"
    SELF_LOCKOUT_BLOCKED = "SERVER_ADMIN_SELF_LOCKOUT_BLOCKED"
    LAST_ADMIN_LOCKOUT_BLOCKED = "SERVER_ADMIN_LAST_ADMIN_LOCKOUT_BLOCKED"
    LOCAL_RECOVERY_UNAVAILABLE = "SERVER_ADMIN_LOCAL_RECOVERY_UNAVAILABLE"
    ACCOUNT_DISABLED = "SERVER_ADMIN_ACCOUNT_DISABLED"
    DEMO_ACCOUNT = "ACCOUNT_DELETION_DEMO_FORBIDDEN"


@dataclass(frozen=True, slots=True)
class OperatorRecoveryProof:
    """One-time recovery proof returned exactly once by the issuing request."""

    recovery_url: str
    expires_at: datetime


def require_account(
    session: Session,
    account_id: UUID,
    *,
    for_update: bool = False,
) -> Account:
    statement = select(Account).where(Account.id == account_id)
    if for_update:
        statement = statement.with_for_update()
    account = session.execute(statement).scalar_one_or_none()
    if account is None:
        raise NotFoundError("Account not found.", ServerAdminAccountErrorCode.NOT_FOUND)
    return account


def primary_email(session: Session, account_id: UUID) -> AccountEmail | None:
    return session.execute(
        select(AccountEmail).where(
            AccountEmail.account_id == account_id,
            AccountEmail.is_primary.is_(True),
        )
    ).scalar_one_or_none()


def _active_verified_server_admins_for_update(session: Session) -> list[Account]:
    allowed = get_settings().server_admin_emails
    if not allowed:
        return []
    # Avoid SELECT DISTINCT ... FOR UPDATE: PostgreSQL does not permit that
    # combination. Lock the matching account rows and deduplicate in Python;
    # one Account may legitimately own more than one allowlisted address.
    rows = list(
        session.execute(
            select(Account)
            .join(AccountEmail, AccountEmail.account_id == Account.id)
            .where(
                Account.disabled_at.is_(None),
                AccountEmail.verified_at.is_not(None),
                AccountEmail.email.in_(allowed),
            )
            .with_for_update()
        )
        .scalars()
        .all()
    )
    return list({account.id: account for account in rows}.values())


def set_suspended(
    session: Session,
    *,
    actor: Account,
    target_account_id: UUID,
    suspended: bool,
) -> tuple[Account, int]:
    """Suspend/unsuspend an Account using the authoritative active flag.

    Suspension revokes all session families immediately. The current operator
    cannot suspend themselves, and concurrent changes lock the active
    ServerAdmin set so two operators cannot race into a zero-admin state.
    """
    target = require_account(session, target_account_id, for_update=True)
    revoked_sessions = 0

    if suspended:
        if target.id == actor.id:
            raise ForbiddenError(
                "The current ServerAdmin cannot suspend their own Account.",
                ServerAdminAccountErrorCode.SELF_LOCKOUT_BLOCKED,
            )
        if target.disabled_at is not None:
            return target, 0

        active_admins = _active_verified_server_admins_for_update(session)
        active_admin_ids = {account.id for account in active_admins}
        if target.id in active_admin_ids and len(active_admin_ids) <= 1:
            raise ForbiddenError(
                "The last active ServerAdmin cannot be suspended.",
                ServerAdminAccountErrorCode.LAST_ADMIN_LOCKOUT_BLOCKED,
            )

        target.disabled_at = now()
        revoked_sessions = sessions.revoke_all(session, target)
        administration.record_action(
            session,
            actor_id=actor.id,
            target_account_id=target.id,
            action=AdministrationAction.ACCOUNT_SUSPENDED,
            effect_count=revoked_sessions,
        )
    else:
        if target.disabled_at is None:
            return target, 0
        target.disabled_at = None
        administration.record_action(
            session,
            actor_id=actor.id,
            target_account_id=target.id,
            action=AdministrationAction.ACCOUNT_UNSUSPENDED,
        )

    session.flush()
    return target, revoked_sessions


def revoke_account_sessions(
    session: Session,
    *,
    actor: Account,
    target_account_id: UUID,
) -> int:
    target = require_account(session, target_account_id)
    revoked = sessions.revoke_all(session, target)
    administration.record_action(
        session,
        actor_id=actor.id,
        target_account_id=target.id,
        action=AdministrationAction.ACCOUNT_SESSIONS_REVOKED,
        effect_count=revoked,
    )
    session.flush()
    return revoked


def verify_account_email(
    session: Session,
    *,
    actor: Account,
    target_account_id: UUID,
    account_email_id: UUID,
    confirmation_email: str,
) -> AccountEmail:
    """Record an explicit operator assertion that one address was verified."""
    require_account(session, target_account_id)
    email_record = session.execute(
        select(AccountEmail)
        .where(
            AccountEmail.id == account_email_id,
            AccountEmail.account_id == target_account_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if email_record is None:
        raise NotFoundError(
            "Account email not found.",
            ServerAdminAccountErrorCode.EMAIL_NOT_FOUND,
        )

    if accounts.normalize_email(confirmation_email) != email_record.email:
        raise ValidationError(
            "The confirmation email does not match the target address.",
            ServerAdminAccountErrorCode.CONFIRMATION_MISMATCH,
        )

    if email_record.verified_at is None:
        email_record.verified_at = now()
        administration.record_action(
            session,
            actor_id=actor.id,
            target_account_id=target_account_id,
            action=AdministrationAction.ACCOUNT_EMAIL_VERIFIED,
        )
        session.flush()
    return email_record


def issue_operator_recovery(
    session: Session,
    *,
    actor: Account,
    target_account_id: UUID,
) -> OperatorRecoveryProof:
    """Issue the existing one-time password recovery proof without email.

    Only the token hash persists. The plaintext exists solely inside the URL
    returned by this request and must never be logged or audited.
    """
    target = require_account(session, target_account_id, for_update=True)
    if not target.is_active:
        raise ValidationError(
            "A suspended Account must be unsuspended before recovery.",
            ServerAdminAccountErrorCode.ACCOUNT_DISABLED,
        )
    if accounts.local_identity(session, target) is None:
        raise ValidationError(
            "This Account has no local-password recovery path.",
            ServerAdminAccountErrorCode.LOCAL_RECOVERY_UNAVAILABLE,
        )

    # Older open proofs are superseded inside the issuing function, under the
    # same subject lock that serializes an operator proof against a recovery
    # link the Account holder requests at the same moment.
    model, issued = action_tokens.issue_account_recovery(session, target.id)
    administration.record_action(
        session,
        actor_id=actor.id,
        target_account_id=target.id,
        action=AdministrationAction.ACCOUNT_RECOVERY_ISSUED,
    )

    base = get_settings().public_base_url.rstrip("/")
    recovery_url = f"{base}/auth/recovery?token={quote(issued.token)}"
    session.flush()
    return OperatorRecoveryProof(recovery_url=recovery_url, expires_at=model.expires_at)


def _matches_deletion_confirmation(
    target_id: UUID,
    primary_email_addr: str | None,
    confirmation: str,
) -> bool:
    clean_conf = confirmation.strip().lower()
    expected: set[str] = {
        str(target_id).lower(),
        f"delete {str(target_id).lower()}",
    }
    if primary_email_addr:
        norm_email = primary_email_addr.strip().lower()
        expected.add(norm_email)
        expected.add(f"delete {norm_email}")
    return clean_conf in expected


def delete_account(
    session: Session,
    *,
    actor: Account,
    target_account_id: UUID,
    confirmation: str,
    journal: DeletionJournal | None = None,
) -> AccountDeletion:
    """Irreversibly delete an Account via the authoritative #520 lifecycle.

    Guards:
    1. Current operator cannot delete themselves (SELF_LOCKOUT_BLOCKED).
    2. Last active verified allowlisted admin cannot be deleted (LAST_ADMIN_LOCKOUT_BLOCKED).
    3. Demo accounts and demo deployments are protected (DEMO_ACCOUNT).
    4. Confirmation must match the target's primary email or ID.

    Lifecycle:
    1. Append tombstone to forward-only DeletionJournal.
    2. apply_accepted_tombstone(session, target.id, accepted_at=tombstone.accepted_at).
    3. enqueue_convergence(session, account_id=target.id, accepted_at=tombstone.accepted_at).
    4. Record auditable AdministrationAction.ACCOUNT_DELETION_REQUESTED.
    """
    target = require_account(session, target_account_id, for_update=True)

    if target.id == actor.id:
        raise ForbiddenError(
            "The current ServerAdmin cannot delete their own Account.",
            ServerAdminAccountErrorCode.SELF_LOCKOUT_BLOCKED,
        )

    active_admins = _active_verified_server_admins_for_update(session)
    active_admin_ids = {account.id for account in active_admins}
    if target.id in active_admin_ids and len(active_admin_ids) <= 1:
        raise ForbiddenError(
            "The last active ServerAdmin cannot be deleted.",
            ServerAdminAccountErrorCode.LAST_ADMIN_LOCKOUT_BLOCKED,
        )

    if canonical.demo_deployment() or canonical.is_canonical_reserved_account(session, target):
        raise ForbiddenError(
            "Demo accounts cannot be deleted through administration.",
            ServerAdminAccountErrorCode.DEMO_ACCOUNT,
        )

    primary = primary_email(session, target.id)
    primary_addr = primary.email if primary else None
    if not _matches_deletion_confirmation(target.id, primary_addr, confirmation):
        raise ValidationError(
            "The confirmation does not match the target account.",
            ServerAdminAccountErrorCode.CONFIRMATION_MISMATCH,
        )

    active_journal = journal if journal is not None else deletion_self_service._configured_journal()
    tombstone = active_journal.accept(target.id, accepted_at=now())

    deletion = apply_accepted_tombstone(
        session,
        target.id,
        accepted_at=tombstone.accepted_at,
    )
    if deletion is None:
        raise ServiceUnavailableError(
            "The accepted Account deletion could not establish fail-closed state.",
            SelfDeletionErrorCode.ACCOUNT_UNAVAILABLE,
        )

    if deletion.status != AccountDeletionStatus.COMPLETED.value:
        enqueue_convergence(
            session,
            account_id=target.id,
            accepted_at=tombstone.accepted_at,
        )

    administration.record_action(
        session,
        actor_id=actor.id,
        target_account_id=target.id,
        action=AdministrationAction.ACCOUNT_DELETION_REQUESTED,
    )
    session.flush()
    return deletion
