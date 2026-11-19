"""Versioned owner-only personal settings with serialized initial creation.

Both scopes share one write path. A write carries only the keys that changed;
``None`` removes a saved choice so the device default applies again. The
concurrency token covers the whole document, so a device that missed another
device's write re-reads before it writes (last writer wins per key, never a
silent lost update of the document).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.core.errors import ConflictError, ErrorCode
from eimir.personal_settings.models import (
    SCHEMA_VERSION,
    AccountSettings,
    PersonalSettings,
    SpaceSettings,
)


def read_document(
    session: Session,
    account_id: UUID,
    space_id: UUID | None,
    *,
    for_update: bool = False,
) -> PersonalSettings | None:
    statement = select(PersonalSettings).where(
        PersonalSettings.account_id == account_id,
        PersonalSettings.space_id.is_(None)
        if space_id is None
        else PersonalSettings.space_id == space_id,
    )
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return session.execute(statement).scalar_one_or_none()


def settings_of[SettingsT: (AccountSettings, SpaceSettings)](
    document: PersonalSettings | None, shape: type[SettingsT]
) -> SettingsT:
    """Validate the stored document; unknown or malformed entries are ignored."""
    if document is None:
        return shape()
    valid: dict[str, Any] = {}
    for name in shape.model_fields:
        if name not in document.settings:
            continue
        try:
            shape.model_validate({name: document.settings[name]})
        except ValueError:
            continue
        valid[name] = document.settings[name]
    return shape.model_validate(valid)


def concurrency_token(
    document: PersonalSettings | None,
    account_id: UUID,
    space_id: UUID | None,
) -> str:
    if document is None:
        return f"{account_id}:{space_id or 'account'}:absent"
    return f"{document.id}:{document.version}"


def save_changes[SettingsT: (AccountSettings, SpaceSettings)](
    session: Session,
    account_id: UUID,
    space_id: UUID | None,
    shape: type[SettingsT],
    changes: dict[str, Any],
    expected_token: str,
) -> PersonalSettings:
    """Merge ``changes`` (validated keys of ``shape``) into the owner's document."""
    document = read_document(session, account_id, space_id, for_update=True)
    if concurrency_token(document, account_id, space_id) != expected_token:
        raise ConflictError(
            "The personal settings changed since they were read.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )
    merged = {**settings_of(document, shape).stored(), **changes}
    stored = shape.model_validate(merged).stored()
    if document is None:
        # PostgreSQL serializes competing initial inserts on the partial unique
        # owner index, like the personal appearance preference does.
        statement = insert(PersonalSettings).values(
            account_id=account_id,
            space_id=space_id,
            schema_version=SCHEMA_VERSION,
            settings=stored,
            version=1,
        )
        if space_id is None:
            statement = statement.on_conflict_do_nothing(
                index_elements=["account_id"],
                index_where=PersonalSettings.space_id.is_(None),
            )
        else:
            statement = statement.on_conflict_do_nothing(
                index_elements=["account_id", "space_id"],
                index_where=PersonalSettings.space_id.is_not(None),
            )
        created = session.execute(statement.returning(PersonalSettings)).scalar_one_or_none()
        if created is None:
            raise ConflictError(
                "The personal settings changed since they were read.",
                ErrorCode.RESOURCE_VERSION_CONFLICT,
            )
        session.flush()
        return created
    document.settings = stored
    document.schema_version = SCHEMA_VERSION
    document.version += 1
    session.flush()
    return document


def _portable(settings: AccountSettings | SpaceSettings) -> dict[str, Any]:
    portable: dict[str, Any] = {}
    for name, value in settings.stored().items():
        head, *rest = name.split("_")
        portable[head + "".join(part.capitalize() for part in rest)] = value
    return portable


def portable_snapshot(session: Session, account_id: UUID, space_id: UUID) -> dict[str, Any]:
    """Export-only view of the owner's saved choices for the personal bundle."""
    account = settings_of(read_document(session, account_id, None), AccountSettings)
    space = settings_of(read_document(session, account_id, space_id), SpaceSettings)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "account": _portable(account),
        "space": _portable(space),
    }


def purge_membership(session: Session, account_id: UUID, space_id: UUID) -> None:
    """Remove the Space document when the owner leaves that Space."""
    session.execute(
        delete(PersonalSettings).where(
            PersonalSettings.account_id == account_id,
            PersonalSettings.space_id == space_id,
        )
    )
