"""Core's manifest executor for the tables of an absent plugin (Decision 0017, decision 4).

With a plugin loaded, its hooks own the lifecycle of its tables, in the order
the Core call sites used before the seam. Without it, the plugin's rows must
still go at the same lifecycle points and expire on time; this module applies
the manifest rules (``eimir.plugins.manifest``) to the tables whose owning
capability no loaded plugin provides, and to those only, so nothing runs twice.

The executor is never weaker than the plugin: it deletes where the plugin
deletes, deletes where the plugin only empties (a once message after its claim
window), deletes short-lived state entirely (``transient``) and removes the
notifications that point at deleted rows. Every statement runs in the caller's
transaction; nothing here commits.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from functools import cache
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import (
    ColumnElement,
    TableClause,
    and_,
    column,
    delete,
    or_,
    select,
    table,
    true,
    tuple_,
)
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.plugins.loader import loaded_plugins
from eimir.plugins.manifest import PLUGIN_TABLES, LifecycleEvent, PluginTable

if TYPE_CHECKING:
    from sqlalchemy import CursorResult


def absent_tables() -> tuple[PluginTable, ...]:
    """Manifest tables whose owning capability no loaded plugin provides."""
    provided = loaded_plugins().capabilities()
    return tuple(row for row in PLUGIN_TABLES if row.capability.value not in provided)


def _columns(row: PluginTable) -> list[str]:
    names = ["id"] if row.notification_targets or row.attachment else []
    if row.space_column:
        names.append(row.space_column)
    names.extend(row.account_columns)
    names.extend(row.expires_columns)
    if row.attachment is not None:
        names.append(row.attachment.column)
    return list(dict.fromkeys(names))


@cache
def _table(row: PluginTable) -> TableClause:
    # One construct per row, so conditions and statements name the same table.
    return table(row.table, *(column(name) for name in _columns(row)))


def _delete(session: Session, row: PluginTable, where: ColumnElement[bool]) -> int:
    target = _table(row)
    returning = [target.c.id] if "id" in target.c else []
    if row.attachment is not None:
        returning.append(target.c[row.attachment.column])
    statement = delete(target).where(where)
    if not returning:
        result = cast("CursorResult[Any]", session.execute(statement))
        return int(result.rowcount or 0)
    deleted = session.execute(statement.returning(*returning)).all()
    if not deleted:
        return 0
    if row.notification_targets:
        from eimir.engagement.models import Notification

        session.execute(
            delete(Notification).where(
                Notification.target_type.in_([target.value for target in row.notification_targets]),
                Notification.target_id.in_([entry[0] for entry in deleted]),
            )
        )
    if row.attachment is not None:
        _hand_attachments_to_cleanup(session, [entry[1] for entry in deleted if entry[1]])
    session.flush()
    return len(deleted)


def _hand_attachments_to_cleanup(session: Session, attachment_ids: Sequence[UUID]) -> None:
    # The media cleanup deletes the bytes; a plugin row never outlives its photo.
    from eimir.attachments import service as attachments
    from eimir.attachments.models import Attachment

    for attachment_id in attachment_ids:
        attachment = session.get(Attachment, attachment_id, with_for_update=True)
        if attachment is not None:
            attachments.mark_for_deletion(session, attachment)


def apply_event(
    session: Session,
    event: LifecycleEvent,
    *,
    space_id: UUID | None = None,
    account_id: UUID | None = None,
) -> int:
    """Delete the absent plugins' rows that ``event`` removes; return the rows deleted."""
    removed = 0
    for row in absent_tables():
        target = _table(row)
        for rule in row.purge_on:
            if rule.event is not event:
                continue
            conditions: list[ColumnElement[bool]] = []
            if event is LifecycleEvent.ACCOUNT_DELETED:
                if rule.account_column is None or account_id is None:
                    continue
                conditions.append(target.c[rule.account_column] == account_id)
            else:
                if row.space_column is None or space_id is None:
                    continue
                conditions.append(target.c[row.space_column] == space_id)
                if rule.account_column is not None:
                    if account_id is None:
                        continue
                    conditions.append(target.c[rule.account_column] == account_id)
            where = and_(*conditions)
            if rule.dependents:
                removed += _delete_dependents(session, row, where, rule.dependents)
            removed += _delete(session, row, where)
    return removed


def _delete_dependents(
    session: Session, row: PluginTable, where: ColumnElement[bool], dependents: Sequence[str]
) -> int:
    target = _table(row)
    pairs = [
        (entry[0], entry[1])
        for entry in session.execute(
            select(target.c[row.space_column or "space_id"], target.c.account_id).where(where)
        )
    ]
    if not pairs:
        return 0
    removed = 0
    rows = {entry.table: entry for entry in PLUGIN_TABLES}
    for name in dependents:
        dependent = rows[name]
        dependent_table = _table(dependent)
        removed += _delete(
            session,
            dependent,
            tuple_(dependent_table.c.space_id, dependent_table.c.account_id).in_(pairs),
        )
    return removed


def prune_expired(session: Session, *, at: datetime | None = None) -> int:
    """Delete the absent plugins' expired and short-lived rows; return the rows deleted."""
    instant = at or clock.now()
    removed = 0
    for row in absent_tables():
        if row.transient:
            removed += _delete(session, row, true())
            continue
        if row.expires_columns:
            target = _table(row)
            removed += _delete(
                session, row, or_(*(target.c[name] <= instant for name in row.expires_columns))
            )
    return removed


def partner_joined(session: Session, space_id: UUID) -> None:
    """Run the plugin hooks and the absent plugins' rules for a joining partner."""
    for plugin in loaded_plugins().plugins:
        plugin.on_partner_joined(session, space_id)
    apply_event(session, LifecycleEvent.PARTNER_JOINED, space_id=space_id)


def membership_ended(session: Session, space_id: UUID, account_id: UUID) -> None:
    """Run the plugin hooks and the absent plugins' rules for an ended membership."""
    for plugin in loaded_plugins().plugins:
        plugin.on_membership_ended(session, space_id, account_id)
    apply_event(session, LifecycleEvent.MEMBERSHIP_ENDED, space_id=space_id, account_id=account_id)


def member_left(session: Session, space_id: UUID, account_id: UUID) -> None:
    """Run the plugin hooks and the absent plugins' rules for a member who leaves."""
    for plugin in loaded_plugins().plugins:
        plugin.on_member_left(session, space_id, account_id)
    apply_event(session, LifecycleEvent.MEMBER_LEFT, space_id=space_id, account_id=account_id)


def account_deleted(session: Session, account_id: UUID) -> None:
    """Run the plugin hooks and the absent plugins' rules for a deleted Account."""
    for plugin in loaded_plugins().plugins:
        plugin.on_account_deleted(session, account_id)
    apply_event(session, LifecycleEvent.ACCOUNT_DELETED, account_id=account_id)


def security_retention(session: Session) -> None:
    """The plugin part of Core's security-retention job."""
    for plugin in loaded_plugins().plugins:
        plugin.prune_expired(session)
    prune_expired(session)
