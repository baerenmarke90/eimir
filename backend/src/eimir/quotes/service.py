"""Service for managing personal Daily Quote preferences."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.identity.models import Account
from eimir.quotes.catalog import (
    CATEGORY_MAP,
    SOURCE_MAP,
    get_categories,
    get_sources,
)
from eimir.quotes.models import DailyQuotePreference


def preference_concurrency_token(
    preference: DailyQuotePreference | None,
    account_id: UUID,
) -> str:
    """Return an opaque ETag concurrency token for account quote preferences."""
    if preference is None:
        return f"{account_id}:absent"
    return f"{preference.id}:{preference.version}"


def get_persisted_preference(
    session: Session,
    account_id: UUID,
    *,
    for_update: bool = False,
) -> DailyQuotePreference | None:
    """Load the persisted preference record if one exists."""
    statement = select(DailyQuotePreference).where(DailyQuotePreference.account_id == account_id)
    if for_update:
        statement = statement.with_for_update()
    return session.execute(statement).scalar_one_or_none()


def get_or_default_preference(
    session: Session,
    account_id: UUID,
) -> DailyQuotePreference:
    """Return caller preference, resolving to the all-sources/all-categories default if unset."""
    existing = get_persisted_preference(session, account_id)
    if existing is not None:
        return existing

    # Transient default: all curated sources and categories enabled
    default_sources = [source.id for source in get_sources()]
    default_categories = [category.id for category in get_categories()]
    return DailyQuotePreference(
        account_id=account_id,
        enabled=True,
        selected_source_ids=default_sources,
        selected_category_ids=default_categories,
        locale=None,
        version=0,
    )


def update_preference(
    session: Session,
    account_id: UUID,
    *,
    enabled: bool | None = None,
    selected_source_ids: list[str] | None = None,
    selected_category_ids: list[str] | None = None,
    locale: str | None = None,
    expected_token: str | None = None,
) -> DailyQuotePreference:
    """Update or create the personal preference record with optimistic concurrency.

    Strictly personal: updates only the caller's account_id.
    """
    # Validation against curated catalog
    if selected_source_ids is not None:
        unknown_sources = [s for s in selected_source_ids if s not in SOURCE_MAP]
        if unknown_sources:
            raise ValidationError(
                f"Unknown source IDs: {', '.join(unknown_sources)}",
                ErrorCode.VALIDATION_FAILED,
            )

    if selected_category_ids is not None:
        unknown_categories = [c for c in selected_category_ids if c not in CATEGORY_MAP]
        if unknown_categories:
            raise ValidationError(
                f"Unknown category IDs: {', '.join(unknown_categories)}",
                ErrorCode.VALIDATION_FAILED,
            )

    # Lock parent account row to serialize concurrent initial writes for the same account
    session.execute(
        select(Account.id).where(Account.id == account_id).with_for_update()
    ).scalar_one_or_none()

    preference = get_persisted_preference(session, account_id, for_update=True)

    if expected_token is not None:
        current_token = preference_concurrency_token(preference, account_id)
        if current_token != expected_token:
            raise ConflictError(
                "The Daily Quote preferences changed since they were read.",
                ErrorCode.RESOURCE_VERSION_CONFLICT,
            )

    if preference is None:
        default_sources = [s.id for s in get_sources()]
        default_categories = [c.id for c in get_categories()]

        preference = DailyQuotePreference(
            account_id=account_id,
            enabled=enabled if enabled is not None else True,
            selected_source_ids=(
                selected_source_ids if selected_source_ids is not None else default_sources
            ),
            selected_category_ids=(
                selected_category_ids if selected_category_ids is not None else default_categories
            ),
            locale=locale,
            version=1,
        )
        session.add(preference)
    else:
        if enabled is not None:
            preference.enabled = enabled
        if selected_source_ids is not None:
            preference.selected_source_ids = selected_source_ids
        if selected_category_ids is not None:
            preference.selected_category_ids = selected_category_ids
        if locale is not None:
            preference.locale = locale
        preference.version += 1

    session.flush()
    return preference
