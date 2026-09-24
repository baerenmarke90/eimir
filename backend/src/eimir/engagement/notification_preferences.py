"""Account-owned channel preferences for persisted notification kinds."""

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
    return _effective_choice(
        session, account_id=account_id, kind=kind, channel=NotificationChannel.PUSH
    )


def digest_push_enabled(session: Session, *, account_id: UUID, kind: str) -> bool:
    """Require an explicit opt-in; current public controls cannot set this row."""
    if not notification_policy.digest_kind_allowed(kind):
        return False
    return (
        session.execute(
            select(NotificationPreference.enabled).where(
                NotificationPreference.account_id == account_id,
                NotificationPreference.kind == kind,
                NotificationPreference.channel == NotificationChannel.PUSH.value,
            )
        ).scalar_one_or_none()
        is True
    )


def in_app_enabled(session: Session, *, account_id: UUID, kind: str) -> bool:
    """Snapshot the recipient's Center choice when a notification is projected."""
    if notification_policy.for_kind(kind) is None:
        return False
    return _effective_choice(
        session, account_id=account_id, kind=kind, channel=NotificationChannel.IN_APP
    )


def email_enabled(session: Session, *, account_id: UUID, kind: str) -> bool:
    """Require an explicit recipient opt-in and an immediate reviewed kind."""
    policy = notification_policy.for_kind(kind)
    if policy is None or not policy.push_immediately:
        return False
    choice = session.execute(
        select(NotificationPreference.enabled).where(
            NotificationPreference.account_id == account_id,
            NotificationPreference.kind == kind,
            NotificationPreference.channel == NotificationChannel.EMAIL.value,
        )
    ).scalar_one_or_none()
    return choice is True


def _effective_choice(
    session: Session, *, account_id: UUID, kind: str, channel: NotificationChannel
) -> bool:
    choice = session.execute(
        select(NotificationPreference.enabled).where(
            NotificationPreference.account_id == account_id,
            NotificationPreference.kind == kind,
            NotificationPreference.channel == channel.value,
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


def own_in_app_choices(session: Session, *, account_id: UUID) -> dict[NotificationKind, bool]:
    """Read one Account's Center overrides; absent rows keep the visible default."""
    rows = session.execute(
        select(NotificationPreference.kind, NotificationPreference.enabled).where(
            NotificationPreference.account_id == account_id,
            NotificationPreference.channel == NotificationChannel.IN_APP.value,
        )
    ).tuples()
    overrides: dict[str, bool] = {kind: enabled for kind, enabled in rows}
    return {kind: overrides.get(kind.value, True) for kind in NotificationKind}


def own_email_choices(session: Session, *, account_id: UUID) -> dict[NotificationKind, bool]:
    """Email defaults off and digestible kinds cannot send individual mail."""
    rows = session.execute(
        select(NotificationPreference.kind, NotificationPreference.enabled).where(
            NotificationPreference.account_id == account_id,
            NotificationPreference.channel == NotificationChannel.EMAIL.value,
        )
    ).tuples()
    overrides: dict[str, bool] = {kind: enabled for kind, enabled in rows}
    return {
        kind: bool(overrides.get(kind.value, False))
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
    _set_choice(
        session,
        account_id=account_id,
        kind=kind,
        channel=NotificationChannel.PUSH,
        enabled=enabled,
    )


def set_in_app_enabled(
    session: Session, *, account_id: UUID, kind: NotificationKind, enabled: bool
) -> None:
    """Serialize the recipient's Center choice with projection and deletion."""
    if notification_policy.for_kind(kind) is None:
        raise ValueError("In-app delivery is not available for this notification kind.")
    _set_choice(
        session,
        account_id=account_id,
        kind=kind,
        channel=NotificationChannel.IN_APP,
        enabled=enabled,
    )


def set_email_enabled(
    session: Session, *, account_id: UUID, kind: NotificationKind, enabled: bool
) -> None:
    """Keep email opt-in separate from Center and Push choices."""
    policy = notification_policy.for_kind(kind)
    if policy is None or not policy.push_immediately:
        raise ValueError("Individual email is not available for this notification kind.")
    _set_choice(
        session,
        account_id=account_id,
        kind=kind,
        channel=NotificationChannel.EMAIL,
        enabled=enabled,
    )


def _set_choice(
    session: Session,
    *,
    account_id: UUID,
    kind: NotificationKind,
    channel: NotificationChannel,
    enabled: bool,
) -> None:
    if account_effects.lock_enabled_accounts(session, {account_id}) is None:
        raise ValueError("Account is unavailable.")

    statement = (
        postgresql.insert(NotificationPreference)
        .values(
            id=new_id(),
            account_id=account_id,
            kind=NotificationKind(kind).value,
            channel=channel.value,
            enabled=enabled,
        )
        .on_conflict_do_update(
            index_elements=["account_id", "kind", "channel"],
            set_={"enabled": enabled, "updated_at": func.now()},
        )
    )
    session.execute(statement)
