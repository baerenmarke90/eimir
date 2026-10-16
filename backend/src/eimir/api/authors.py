"""Centralized batch resolution of AuthorSummary projections."""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.api.schema import AuthorSummary
from eimir.attachments.binding import AccountProfileAttachment
from eimir.identity.deletion_models import AccountDeletion
from eimir.identity.models import Account


def resolve_author_summaries(
    session: Session,
    account_ids: Iterable[UUID],
) -> dict[UUID, AuthorSummary]:
    """Batch-resolve privacy-safe AuthorSummary projections in one query.

    An accepted AccountDeletion is the authoritative former-member signal. Once
    it exists, the projection suppresses the stored display name and avatar even
    if slower deletion cleanup has not removed those rows yet. Suspension alone
    must never be interpreted as deletion.
    """
    ids = set(account_ids)
    if not ids:
        return {}

    statement = (
        select(
            Account,
            AccountProfileAttachment.attachment_id,
            AccountDeletion.account_id.label("deleted_account_id"),
        )
        .outerjoin(
            AccountProfileAttachment,
            AccountProfileAttachment.account_id == Account.id,
        )
        .outerjoin(AccountDeletion, AccountDeletion.account_id == Account.id)
        .where(Account.id.in_(ids))
    )
    rows = session.execute(statement).all()
    return {
        account.id: AuthorSummary(
            id=account.id,
            display_name="" if deleted_account_id is not None else account.display_name,
            is_former_member=deleted_account_id is not None,
            profile_attachment_id=None if deleted_account_id is not None else attachment_id,
        )
        for account, attachment_id, deleted_account_id in rows
    }


def resolve_author_summary(
    session: Session,
    account_id: UUID,
    *,
    resource: str = "Author",
) -> AuthorSummary:
    """Resolve a single privacy-safe AuthorSummary projection."""
    summaries = resolve_author_summaries(session, (account_id,))
    summary = summaries.get(account_id)
    if summary is None:
        raise RuntimeError(f"{resource} disappeared despite foreign key protection.")
    return summary
