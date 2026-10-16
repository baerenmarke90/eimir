"""Short-lived one-time tokens for cloud authentication flows.

Email verification, magic links, and account recovery deliberately use
separate tables and separate issuing functions. A token therefore cannot be
accidentally accepted by a different flow. Only its SHA-256 hash is persisted;
the plaintext exists only in the issuing function's return value.

Each flow keeps at most one live generation per subject: requesting a new link
supersedes every older open one. That is an authentication contract, not a
convenience, so it is enforced by serializing the subject rather than by
hoping two requests do not overlap. Issuing and consuming both take the same
subject lock before they read the state they are about to decide on, in the
same order, so the outcome of a race is decided by the lock rather than by
timing, and neither can resurrect a superseded proof.

Public demo entry proofs are the one deliberate exception. They share the
magic-link table and its consume path, because redemption is identical
either way, but ``issue_demo_entry_proof`` is a second authority domain on
that same subject column: it never supersedes and is never superseded by an
emailed magic link for the same address. Demo proofs additionally take the
canonical-demo auth authority lock so issuance and redemption are ordered
against the periodic reset without reusing magic-link supersession semantics.
See ``MagicLinkToken.is_demo_entry`` and ``issue_demo_entry_proof`` for why,
and ``issue_magic_link`` for how the emailed-link domain excludes demo rows
from what it treats as open.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import ColumnElement, delete, or_, select
from sqlalchemy.orm import InstrumentedAttribute, Session

if TYPE_CHECKING:
    from sqlalchemy import CursorResult

from eimir.auth.demo_authority import lock_demo_auth_authority
from eimir.auth.tokens import generate_token, hash_token
from eimir.core.clock import now
from eimir.core.errors import ValidationError
from eimir.db.locks import lock_subject
from eimir.identity.models import (
    AccountRecoveryToken,
    EmailVerificationToken,
    MagicLinkToken,
    OneTimeTokenMixin,
    SignupProof,
)

EMAIL_VERIFICATION_LIFETIME = timedelta(hours=24)
MAGIC_LINK_LIFETIME = timedelta(minutes=15)
ACCOUNT_RECOVERY_LIFETIME = timedelta(minutes=30)
ACTION_TOKEN_BYTES = 32

GENERATION_LOCK = "action_token_generation"
"""Namespace for the serialization boundary around one flow and subject.

The lock is subject-scoped rather than taken on the Account or AccountEmail
row, for two reasons. A row lock on the subject would also block unrelated
work on that Account for as long as the request runs, including the mail
delivery that follows issuing. And the rate-limit advisory lock is not this
boundary either: it is reserved and released inside its own short security
transaction before token work begins, so it does not span revoke-then-issue.
"""

SIGNUP_PROOF_LIFETIME = timedelta(minutes=15)

FLOW_EMAIL_VERIFICATION = "email_verification"
FLOW_MAGIC_LINK = "magic_link"
FLOW_ACCOUNT_RECOVERY = "account_recovery"
FLOW_SIGNUP = "signup"


class ActionTokenErrorCode:
    INVALID = "ACTION_TOKEN_INVALID"


@dataclass(frozen=True)
class IssuedActionToken:
    token: str
    """Plaintext token. It is stored neither on the model nor in logs."""


def _supersede_open[TokenModel: OneTimeTokenMixin](
    session: Session,
    model_type: type[TokenModel],
    subject_column: InstrumentedAttribute[UUID] | InstrumentedAttribute[str],
    subject_id: UUID | str,
    *,
    flow: str,
    extra_where: Sequence[ColumnElement[bool]] = (),
) -> datetime:
    """Serialize the subject and close every older open generation.

    The lock is taken before the read, because the window to close is exactly
    the one between observing "no open predecessor" and inserting a successor.
    Two requests would otherwise both observe none and both commit one, and the
    tables cannot catch that: only ``token_hash`` is unique, and a partial
    unique index cannot express "open" because expiry depends on the current
    time.

    ``extra_where`` narrows what counts as an "open predecessor" for callers
    whose subject column is shared by more than one authority domain. It does
    not change what gets locked: the lock still serializes the whole subject,
    because a caller that reads a narrower set still needs to be ordered
    against anything else deciding on the same subject at the same time.

    Returns the time the generation was established, so the caller derives the
    new expiry from the same instant the predecessors were revoked.
    """
    lock_subject(session, GENERATION_LOCK, flow, str(subject_id))

    current_time = now()
    superseded = (
        session.execute(
            select(model_type).where(
                subject_column == subject_id,
                model_type.consumed_at.is_(None),
                model_type.revoked_at.is_(None),
                *extra_where,
            )
        )
        .scalars()
        .all()
    )
    for model in superseded:
        model.revoked_at = current_time
    session.flush()
    return current_time


def issue_email_verification(
    session: Session, account_email_id: UUID
) -> tuple[EmailVerificationToken, IssuedActionToken]:
    issued_at = _supersede_open(
        session,
        EmailVerificationToken,
        EmailVerificationToken.account_email_id,
        account_email_id,
        flow=FLOW_EMAIL_VERIFICATION,
    )
    token = generate_token(ACTION_TOKEN_BYTES)
    model = EmailVerificationToken(
        account_email_id=account_email_id,
        token_hash=hash_token(token),
        expires_at=issued_at + EMAIL_VERIFICATION_LIFETIME,
    )
    session.add(model)
    session.flush()
    return model, IssuedActionToken(token)


def issue_magic_link(
    session: Session, account_email_id: UUID
) -> tuple[MagicLinkToken, IssuedActionToken]:
    """Issue an emailed magic link, superseding older open emailed links.

    Only other emailed links for this address are treated as predecessors
    here: a public demo entry proof for the same address (see
    ``issue_demo_entry_proof``) lives in a different authority domain and is
    never superseded by this call, and this call is never superseded by one.
    """
    issued_at = _supersede_open(
        session,
        MagicLinkToken,
        MagicLinkToken.account_email_id,
        account_email_id,
        flow=FLOW_MAGIC_LINK,
        extra_where=(MagicLinkToken.is_demo_entry.is_(False),),
    )
    token = generate_token(ACTION_TOKEN_BYTES)
    model = MagicLinkToken(
        account_email_id=account_email_id,
        token_hash=hash_token(token),
        expires_at=issued_at + MAGIC_LINK_LIFETIME,
    )
    session.add(model)
    session.flush()
    return model, IssuedActionToken(token)


def issue_demo_entry_proof(
    session: Session, account_email_id: UUID
) -> tuple[MagicLinkToken, IssuedActionToken]:
    """Issue a one-time entry proof for a public demo persona.

    Unlike ``issue_magic_link``, this never supersedes anything: the public
    demo deliberately lets independent visitors hold separate, simultaneously
    valid proofs for the same shared canonical persona, so one visitor
    requesting entry must not revoke another visitor's still-unconsumed
    proof. There is still no read of "open predecessors" and no generation
    lock. Instead, the separate canonical-demo auth authority lock orders this
    independent insert against reset. If issuance owns that lock first, reset
    follows it and deletes the committed proof; if reset owns it first, the
    issuance is unambiguously post-reset. The lock never turns one demo proof
    into the predecessor of another.
    """
    lock_demo_auth_authority(session)
    issued_at = now()
    token = generate_token(ACTION_TOKEN_BYTES)
    model = MagicLinkToken(
        account_email_id=account_email_id,
        token_hash=hash_token(token),
        expires_at=issued_at + MAGIC_LINK_LIFETIME,
        is_demo_entry=True,
    )
    session.add(model)
    session.flush()
    return model, IssuedActionToken(token)


def issue_account_recovery(
    session: Session, account_id: UUID
) -> tuple[AccountRecoveryToken, IssuedActionToken]:
    issued_at = _supersede_open(
        session,
        AccountRecoveryToken,
        AccountRecoveryToken.account_id,
        account_id,
        flow=FLOW_ACCOUNT_RECOVERY,
    )
    token = generate_token(ACTION_TOKEN_BYTES)
    model = AccountRecoveryToken(
        account_id=account_id,
        token_hash=hash_token(token),
        expires_at=issued_at + ACCOUNT_RECOVERY_LIFETIME,
    )
    session.add(model)
    session.flush()
    return model, IssuedActionToken(token)


def _consume[TokenModel: OneTimeTokenMixin](
    session: Session,
    model_type: type[TokenModel],
    token: str,
    *,
    subject_column: InstrumentedAttribute[UUID] | InstrumentedAttribute[str],
    flow: str,
) -> TokenModel:
    """Redeem a token exactly once, ordered against a competing reissue.

    The subject is read first, unlocked, purely to learn which subject to lock:
    a token never changes the subject it belongs to. The generation lock is
    then taken before the row lock, the same order issuing uses, so consuming
    and reissuing cannot deadlock and cannot interleave.

    Whichever wins the lock decides the outcome. A reissue that commits first
    has revoked this token, so the redemption fails with the ordinary invalid
    response. A redemption that commits first leaves a consumed token that the
    reissue no longer treats as an open predecessor. Neither order can reopen a
    superseded or consumed proof.
    """
    invalid = ValidationError(
        "This authentication token is no longer valid.", ActionTokenErrorCode.INVALID
    )
    if not token:
        raise invalid

    token_hash = hash_token(token)
    subject_id = session.execute(
        select(subject_column).where(model_type.token_hash == token_hash)
    ).scalar_one_or_none()
    if subject_id is None:
        raise invalid

    lock_subject(session, GENERATION_LOCK, flow, str(subject_id))

    # populate_existing discards anything already loaded for this row. Without
    # it the identity map could still answer with the state read before the
    # lock, which is exactly the state the winning transaction may have
    # replaced.
    model = session.execute(
        select(model_type)
        .where(model_type.token_hash == token_hash)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    current_time = now()
    if model is None or not model.is_open(current_time):
        raise invalid

    model.consumed_at = current_time
    session.flush()
    return model


def _lock_demo_magic_link_authority(session: Session, token: str) -> None:
    """Take the reset authority lock before a demo proof's generation lock.

    The first lookup only classifies an immutable token row; it does not decide
    whether redemption succeeds. Reset may delete the row between that lookup
    and acquiring the authority lock. ``_consume`` therefore performs the
    authoritative lookup again afterwards and rejects a token that reset won.

    This extra outer lock applies only to rows explicitly marked as public-demo
    entry proofs. Ordinary magic links keep their existing generation-lock
    behavior and latest-generation-only policy unchanged.
    """
    if not token:
        return
    is_demo_entry = session.execute(
        select(MagicLinkToken.is_demo_entry).where(MagicLinkToken.token_hash == hash_token(token))
    ).scalar_one_or_none()
    if is_demo_entry is True:
        lock_demo_auth_authority(session)


def consume_email_verification(session: Session, token: str) -> EmailVerificationToken:
    return _consume(
        session,
        EmailVerificationToken,
        token,
        subject_column=EmailVerificationToken.account_email_id,
        flow=FLOW_EMAIL_VERIFICATION,
    )


def consume_magic_link(session: Session, token: str) -> MagicLinkToken:
    _lock_demo_magic_link_authority(session, token)
    return _consume(
        session,
        MagicLinkToken,
        token,
        subject_column=MagicLinkToken.account_email_id,
        flow=FLOW_MAGIC_LINK,
    )


def consume_account_recovery(session: Session, token: str) -> AccountRecoveryToken:
    return _consume(
        session,
        AccountRecoveryToken,
        token,
        subject_column=AccountRecoveryToken.account_id,
        flow=FLOW_ACCOUNT_RECOVERY,
    )


def issue_signup_proof(session: Session, email: str) -> tuple[SignupProof, IssuedActionToken]:
    """Issue a Cloud signup proof, superseding older open proofs for the address.

    The subject is the normalized address rather than an AccountEmail, because
    the address may not belong to any Account yet. The same generation lock
    therefore also serializes every consumption for that address, which is
    what keeps two redemptions from both deciding that no Account exists.
    """
    issued_at = _supersede_open(
        session,
        SignupProof,
        SignupProof.email,
        email,
        flow=FLOW_SIGNUP,
    )
    token = generate_token(ACTION_TOKEN_BYTES)
    model = SignupProof(
        email=email,
        token_hash=hash_token(token),
        expires_at=issued_at + SIGNUP_PROOF_LIFETIME,
    )
    session.add(model)
    session.flush()
    return model, IssuedActionToken(token)


def consume_signup_proof(session: Session, token: str) -> SignupProof:
    """Redeem a signup proof once; the generation lock stays held until commit.

    Callers decide about Account creation after this returns and inside the same
    transaction, so that decision is serialized per address as well.
    """
    return _consume(
        session,
        SignupProof,
        token,
        subject_column=SignupProof.email,
        flow=FLOW_SIGNUP,
    )


def prune_signup_proofs(session: Session) -> int:
    """Delete signup proofs that can no longer be redeemed.

    Unlike Account-bound tokens, a signup proof carries a plain address that may
    never become an Account. Keeping spent rows would retain that address
    without purpose. Deleting them does not reopen anything: redemption looks
    the hash up and rejects a missing row exactly like a consumed one.
    """
    result = cast(
        "CursorResult[Any]",
        session.execute(
            delete(SignupProof).where(
                or_(
                    SignupProof.expires_at < now(),
                    SignupProof.consumed_at.is_not(None),
                    SignupProof.revoked_at.is_not(None),
                )
            )
        ),
    )
    return int(result.rowcount or 0)


def revoke(session: Session, model: OneTimeTokenMixin) -> None:
    """Invalidate an open token."""
    if model.consumed_at is None and model.revoked_at is None:
        model.revoked_at = now()
        session.flush()
