"""Account-owned push preference authority for persisted notification kinds."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.core.ids import new_id
from eimir.engagement import notification_policy
from eimir.engagement.models import NotificationChannel, NotificationKind, NotificationPreference
from eimir.identity import effects as account_effects


def push_enabled(session: Session, *, account_id: UUID, kind: str) -> bool:
    """Intersect the current delivery class with the recipient's PUSH choice.

    No override preserves the established immediate-push behavior for an
    already registered endpoint. A digestible or unknown kind can never be
    promoted to immediate delivery by an override.
    """
    policy = notification_policy.for_kind(kind)
    if policy is None or not policy.push_immediately:
        return False
    choice = session.execute(
        select(NotificationPreference.enabled).where(
            NotificationPreference.account_id == account_id,
            NotificationPreference.kind == kind,
            NotificationPreference.channel == NotificationChannel.PUSH.value,
        )
    ).scalar_one_or_none()
    return choice if choice is not None else True


def own_push_choices(session: Session, *, account_id: UUID) -> dict[NotificationKind, bool]:
    """Read one Account's effective choices for the closed policy catalog."""
    rows = session.execute(
        select(NotificationPreference.kind, NotificationPreference.enabled).where(
            NotificationPreference.account_id == account_id,
            NotificationPreference.channel == NotificationChannel.PUSH.value,
        )
    ).tuples()
    overrides: dict[str, bool] = {kind: enabled for kind, enabled in rows}
    return {
        kind: bool(overrides.get(kind.value, True))
        if notification_policy.POLICIES[kind].push_immediately
        else False
        for kind in NotificationKind
    }


def set_push_enabled(
    session: Session, *, account_id: UUID, kind: NotificationKind, enabled: bool
) -> None:
    """Serialize a personal preference change with any provider-side effect.

    Callers supply the authenticated Account ID, never one from a request
    body or another Space member.
    """
    policy = notification_policy.for_kind(kind)
    if policy is None or not policy.push_immediately:
        raise ValueError("Push is not available for this notification kind.")
    if account_effects.lock_enabled_accounts(session, {account_id}) is None:
        raise ValueError("Account is unavailable.")

    statement = (
        postgresql.insert(NotificationPreference)
        .values(
            id=new_id(),
            account_id=account_id,
            kind=NotificationKind(kind).value,
            channel=NotificationChannel.PUSH.value,
            enabled=enabled,
        )
        .on_conflict_do_update(
            index_elements=["account_id", "kind", "channel"],
            set_={"enabled": enabled, "updated_at": func.now()},
        )
    )
    session.execute(statement)
