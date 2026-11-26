"""ServerAdmin People search, Space file and individual storage quota (#2324).

The Space file shows the operator whom a Space concerns at the level the
privacy policy names for administration tools: primary email, verification,
sign-in methods and membership. Never display names, Space names, relationship
dates or content. Every Space file view is recorded in the privileged audit.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from pydantic import Field
from sqlalchemy import ColumnElement, or_, select
from sqlalchemy.orm import Session

from eimir.administration import account_operations
from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction, InstanceAdministrationActionEvent
from eimir.api.deps import CurrentServerAdmin, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.server_admin import (
    ServerAdminAccountSummary,
    ServerAdminSpaceDetail,
    ServerAdminSpaceEntitlementView,
    ServerAdminSpaceSummary,
    _account_summary,
    _auth_methods,
    _require_space,
    _space_entitlement_view,
    space_detail,
    space_summaries,
)
from eimir.attachments import quota as storage_quota
from eimir.attachments import quota_override
from eimir.config import Deployment, get_settings
from eimir.core.clock import ensure_utc, now
from eimir.core.errors import NotFoundError, ValidationError
from eimir.core.ids import parse_id
from eimir.entitlements.models import EntitlementGrant
from eimir.identity.models import Account, AccountEmail
from eimir.relationship.models import Membership

router = APIRouter(prefix="/server-admin", tags=["server-admin"])

SEARCH_ACCOUNT_LIMIT = 20
SEARCH_SPACE_LIMIT = 40
SEARCH_MIN_LENGTH = 2
TIMELINE_LIMIT = 20
LIKE_ESCAPE = "\\"


class ServerAdminStorageQuotaOverride(ApiModel):
    quota_bytes: int
    effective_until: datetime | None
    set_at: datetime


class ServerAdminMediaTypeUsage(ApiModel):
    media_type: str
    bytes: int


class ServerAdminSpaceStorage(ApiModel):
    used_bytes: int
    quota_bytes: int | None
    """The quota that applies now; ``None`` means unmetered (Self-Hosted)."""
    tier_quota_bytes: int | None
    override: ServerAdminStorageQuotaOverride | None
    by_media_type: list[ServerAdminMediaTypeUsage]


class ServerAdminStorageQuotaRequest(ApiModel):
    quota_gb: int = Field(ge=quota_override.MIN_QUOTA_GB, le=quota_override.MAX_QUOTA_GB)
    effective_until: datetime | None = None


def _require_cloud() -> None:
    # Self-Hosted is unmetered, so there is no quota to adjust.
    if get_settings().deployment is not Deployment.CLOUD:
        raise NotFoundError("Storage quota not available.", "SERVER_ADMIN_QUOTA_UNAVAILABLE")


def space_storage_view(session: Session, space_id: UUID) -> ServerAdminSpaceStorage:
    """The Space's storage against its quota, with an active override if any."""
    settings = get_settings()
    at = now()
    override = (
        quota_override.active_override(session, space_id, at)
        if settings.deployment is Deployment.CLOUD
        else None
    )
    by_type = storage_quota.usage_by_media_type(session, space_id)
    return ServerAdminSpaceStorage(
        used_bytes=storage_quota.space_usage(session, space_id),
        quota_bytes=storage_quota.space_quota(session, space_id, settings=settings),
        tier_quota_bytes=storage_quota.tier_quota(session, space_id, settings=settings),
        override=(
            ServerAdminStorageQuotaOverride(
                quota_bytes=override.quota_bytes,
                effective_until=override.effective_until,
                set_at=override.set_at,
            )
            if override is not None
            else None
        ),
        by_media_type=[
            ServerAdminMediaTypeUsage(media_type=media_type, bytes=total)
            for media_type, total in sorted(by_type.items(), key=lambda item: -item[1])
        ],
    )


@router.put(
    "/spaces/{space_id}/storage-quota",
    response_model=ServerAdminSpaceStorage,
    operation_id="setServerAdminSpaceStorageQuota",
    responses=problem_responses(401, 403, 404, 422),
)
def set_server_admin_space_storage_quota(
    body: ServerAdminStorageQuotaRequest,
    admin: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
) -> ServerAdminSpaceStorage:
    """Set an individual Cloud quota that replaces the tier value while active.

    It may be higher or lower than the tier value. Below the current usage
    nothing is deleted; only new bytes are refused.
    """
    _require_cloud()
    parsed = _require_space(session, space_id)
    at = now()
    until = ensure_utc(body.effective_until) if body.effective_until is not None else None
    if until is not None and until <= at:
        raise ValidationError(
            "The end date must lie in the future.", "SERVER_ADMIN_QUOTA_END_IN_PAST"
        )
    quota_override.set_override(
        session,
        parsed,
        quota_bytes=body.quota_gb * quota_override.GIGABYTE,
        effective_until=until,
        set_by_account_id=admin.id,
        at=at,
    )
    administration.record_action(
        session,
        actor_id=admin.id,
        action=AdministrationAction.SPACE_STORAGE_QUOTA_SET,
        target_space_id=parsed,
    )
    return space_storage_view(session, parsed)


@router.delete(
    "/spaces/{space_id}/storage-quota",
    status_code=204,
    operation_id="clearServerAdminSpaceStorageQuota",
    responses=problem_responses(401, 403, 404),
)
def clear_server_admin_space_storage_quota(
    admin: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
) -> Response:
    """Remove the individual quota; the tier value applies again at once."""
    _require_cloud()
    parsed = _require_space(session, space_id)
    if quota_override.clear_override(session, parsed):
        administration.record_action(
            session,
            actor_id=admin.id,
            action=AdministrationAction.SPACE_STORAGE_QUOTA_CLEARED,
            target_space_id=parsed,
        )
    return Response(status_code=204)


# --- People search ---------------------------------------------------------


class ServerAdminSearchResult(ApiModel):
    accounts: list[ServerAdminAccountSummary]
    spaces: list[ServerAdminSpaceSummary]


def _escape_like(value: str) -> str:
    """Make ``%`` and ``_`` in an operator's query match literally."""
    return (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )


@router.get(
    "/search",
    response_model=ServerAdminSearchResult,
    operation_id="searchServerAdmin",
    responses=problem_responses(401, 403, 422),
)
def search_server_admin(
    _: CurrentServerAdmin,
    session: DbSession,
    q: Annotated[str, Query(max_length=320)] = "",
) -> ServerAdminSearchResult:
    """Find Accounts by email part or id, their Spaces, and a Space by id.

    Names are protected content and never matched. At most 20 Accounts come
    back, so the Account-Space link cannot be listed in bulk.
    """
    query = q.strip().lower()
    exact_id = parse_id(query)
    if exact_id is None and len(query.strip("%_")) < SEARCH_MIN_LENGTH:
        return ServerAdminSearchResult(accounts=[], spaces=[])

    email_match = select(AccountEmail.account_id).where(
        AccountEmail.email.like(f"%{_escape_like(query)}%", escape=LIKE_ESCAPE)
    )
    account_filter: ColumnElement[bool] = Account.id.in_(email_match)
    if exact_id is not None:
        account_filter = or_(account_filter, Account.id == exact_id)
    accounts = list(
        session.execute(
            select(Account)
            .where(account_filter)
            .order_by(Account.created_at.desc(), Account.id)
            .limit(SEARCH_ACCOUNT_LIMIT)
        ).scalars()
    )

    space_ids: list[UUID] = []
    if exact_id is not None:
        space_ids.append(exact_id)
    if accounts:
        for space_id in session.execute(
            select(Membership.space_id)
            .where(Membership.account_id.in_([account.id for account in accounts]))
            .group_by(Membership.space_id)
            .order_by(Membership.space_id)
        ).scalars():
            if space_id not in space_ids:
                space_ids.append(space_id)
    current_time = now()
    return ServerAdminSearchResult(
        accounts=[
            _account_summary(session, account, current_time=current_time) for account in accounts
        ],
        spaces=space_summaries(session, space_ids[:SEARCH_SPACE_LIMIT]),
    )


# --- Space file ------------------------------------------------------------


class ServerAdminSpaceMember(ApiModel):
    """A member Account at email level; never a display name."""

    account_id: UUID
    primary_email: str | None
    email_verified: bool
    auth_methods: list[str]
    membership_status: str
    since: datetime
    ended_at: datetime | None


class ServerAdminSpaceTimelineEntry(ApiModel):
    at: datetime
    kind: str
    """``entitlement_grant`` or an administration action."""
    source_type: str | None = None
    tier: str | None = None
    effective_until: datetime | None = None


class ServerAdminSpaceFile(ApiModel):
    space: ServerAdminSpaceDetail
    members: list[ServerAdminSpaceMember]
    storage: ServerAdminSpaceStorage
    entitlement: ServerAdminSpaceEntitlementView
    timeline: list[ServerAdminSpaceTimelineEntry]


def _members(session: Session, space_id: UUID) -> list[ServerAdminSpaceMember]:
    members: list[ServerAdminSpaceMember] = []
    for membership in session.execute(
        select(Membership)
        .where(Membership.space_id == space_id)
        .order_by(Membership.created_at, Membership.id)
    ).scalars():
        primary = account_operations.primary_email(session, membership.account_id)
        members.append(
            ServerAdminSpaceMember(
                account_id=membership.account_id,
                primary_email=primary.email if primary is not None else None,
                email_verified=bool(primary is not None and primary.verified_at is not None),
                auth_methods=_auth_methods(session, membership.account_id),
                membership_status=membership.status,
                since=membership.joined_at or membership.created_at,
                ended_at=membership.ended_at,
            )
        )
    return members


def _timeline(session: Session, space_id: UUID) -> list[ServerAdminSpaceTimelineEntry]:
    entries = [
        ServerAdminSpaceTimelineEntry(
            at=grant.created_at,
            kind="entitlement_grant",
            source_type=grant.source_type,
            tier=grant.tier,
            effective_until=grant.effective_until,
        )
        for grant in session.execute(
            select(EntitlementGrant)
            .where(EntitlementGrant.space_id == space_id)
            .order_by(EntitlementGrant.created_at.desc())
            .limit(TIMELINE_LIMIT)
        ).scalars()
    ]
    entries += [
        ServerAdminSpaceTimelineEntry(at=event.created_at, kind=event.action)
        for event in session.execute(
            select(InstanceAdministrationActionEvent)
            .where(
                InstanceAdministrationActionEvent.target_space_id == space_id,
                InstanceAdministrationActionEvent.action
                != AdministrationAction.SPACE_FILE_VIEWED.value,
            )
            .order_by(InstanceAdministrationActionEvent.created_at.desc())
            .limit(TIMELINE_LIMIT)
        ).scalars()
    ]
    entries.sort(key=lambda entry: entry.at, reverse=True)
    return entries[:TIMELINE_LIMIT]


@router.get(
    "/spaces/{space_id}/file",
    response_model=ServerAdminSpaceFile,
    operation_id="getServerAdminSpaceFile",
    responses=problem_responses(401, 403, 404),
)
def get_server_admin_space_file(
    admin: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
) -> ServerAdminSpaceFile:
    """Everything an operator needs about one Space, without names or content.

    Each call is recorded as ``space_file_viewed`` in the privileged audit.
    """
    parsed = _require_space(session, space_id)
    result = ServerAdminSpaceFile(
        space=space_detail(session, parsed),
        members=_members(session, parsed),
        storage=space_storage_view(session, parsed),
        entitlement=_space_entitlement_view(session, parsed),
        timeline=_timeline(session, parsed),
    )
    administration.record_action(
        session,
        actor_id=admin.id,
        action=AdministrationAction.SPACE_FILE_VIEWED,
        target_space_id=parsed,
    )
    return result
