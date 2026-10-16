"""Versioned personal icon preferences with serialized initial creation."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.appearance.models import AppIconId, AppIconPreference
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError, ErrorCode


def read_preference(
    session: Session,
    authorization: AuthorizationContext,
    *,
    for_update: bool = False,
) -> AppIconPreference | None:
    statement = select(AppIconPreference).where(
        AppIconPreference.account_id == authorization.account_id,
        AppIconPreference.space_id == authorization.space_id,
    )
    if for_update:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    return session.execute(statement).scalar_one_or_none()


def concurrency_token(
    preference: AppIconPreference | None,
    authorization: AuthorizationContext,
) -> str:
    if preference is None:
        return f"{authorization.account_id}:{authorization.space_id}:absent"
    return f"{preference.id}:{preference.version}"


def save_preference(
    session: Session,
    authorization: AuthorizationContext,
    icon_id: AppIconId,
    expected_token: str,
) -> AppIconPreference:
    preference = read_preference(session, authorization, for_update=True)
    if concurrency_token(preference, authorization) != expected_token:
        raise ConflictError(
            "The app-icon preference changed since it was read.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )
    if preference is None:
        # PostgreSQL serializes competing initial inserts on the unique owner
        # pair. Avoid reversing the deletion lifecycle's Account/Membership
        # lock order merely to lock a row that does not yet exist.
        preference = session.execute(
            insert(AppIconPreference)
            .values(
                account_id=authorization.account_id,
                space_id=authorization.space_id,
                icon_id=icon_id.value,
                version=1,
            )
            .on_conflict_do_nothing(index_elements=["account_id", "space_id"])
            .returning(AppIconPreference)
        ).scalar_one_or_none()
        if preference is None:
            raise ConflictError(
                "The app-icon preference changed since it was read.",
                ErrorCode.RESOURCE_VERSION_CONFLICT,
            )
    else:
        preference.icon_id = icon_id.value
        preference.version += 1
    session.flush()
    return preference
