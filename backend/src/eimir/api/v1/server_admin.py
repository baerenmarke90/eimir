"""ServerAdmin-only operational and application-administration read models.

The dashboard reports eimir. application state only. It deliberately has
no shell, filesystem, container, SQL-console, or private-content inspection
surface.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from pydantic import Field
from sqlalchemy import case, distinct, exists, func, or_, select
from sqlalchemy.orm import Session

from eimir.administration import account_operations
from eimir.administration import service as administration
from eimir.administration.models import (
    AdministrationAction,
    AdministrationSetting,
    InstanceAdministrationSettings,
)
from eimir.api.deps import CurrentServerAdmin, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.health import build_revision
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.auth import cloud, recent_auth
from eimir.config import MailTransport
from eimir.config import get_settings as get_runtime_settings
from eimir.core.clock import now
from eimir.core.errors import NotFoundError, ValidationError
from eimir.core.ids import parse_id
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.identity import service as accounts
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import (
    Account,
    AccountEmail,
    AuthIdentity,
    AuthProvider,
    DeviceSession,
    WebAuthnCredential,
)
from eimir.jobs.models import Job, JobStatus
from eimir.mail import sender as mail_sender
from eimir.relationship.models import (
    MAX_ACTIVE_PARTNERS,
    Membership,
    MembershipStatus,
    Space,
)

router = APIRouter(prefix="/server-admin", tags=["server-admin"])
_PROCESS_STARTED_AT = now()

AccountStatusFilter = Literal["all", "active", "suspended"]
VerificationFilter = Literal["all", "verified", "unverified"]
SpaceStatusFilter = Literal["all", "active", "inactive", "empty", "anomaly"]
SpaceLifecycleStatus = Literal["active", "inactive", "empty"]


class ServerAdminFailedJob(ApiModel):
    """Safe queue metadata without payload or raw exception text."""

    id: UUID
    kind: str
    attempts: int
    max_attempts: int
    finished_at: datetime | None


class ServerAdminOverview(ApiModel):
    """Privacy-safe operational projection for one eimir. installation."""

    application_status: str
    database_status: str
    worker_status: str
    media_status: str
    deployment: str
    environment: str
    build_revision: str
    process_started_at: datetime
    public_base_url: str
    media_store: str
    mail_transport: str
    oidc_connection_count: int
    demo_mode: bool
    database_provider: str
    account_count: int
    enabled_account_count: int
    suspended_account_count: int
    verified_primary_email_count: int
    unverified_primary_email_count: int
    accounts_last_24h: int
    accounts_last_7d: int
    accounts_last_30d: int
    active_session_count: int
    local_password_account_count: int
    oidc_account_count: int
    passkey_account_count: int
    server_admin_allowlist_count: int
    server_admin_verified_match_count: int
    active_space_count: int
    media_object_count: int
    media_stored_bytes: int
    jobs_pending: int
    jobs_running: int
    jobs_failed: int
    oldest_pending_job_at: datetime | None
    last_successful_job_at: datetime | None
    recent_failed_jobs: list[ServerAdminFailedJob]
    warning_codes: list[str]


class ServerAdminSettings(ApiModel):
    registration_enabled: bool
    maintenance_mode: bool
    effective_registration_enabled: bool
    version: int


class ServerAdminSettingUpdate(ApiModel):
    enabled: bool


class ServerAdminActivityItem(ApiModel):
    id: UUID
    actor_id: UUID | None
    setting: str
    previous_value: bool
    new_value: bool
    created_at: datetime


class ServerAdminActionActivityItem(ApiModel):
    id: UUID
    actor_id: UUID | None
    target_account_id: UUID | None
    target_space_id: UUID | None
    action: str
    effect_count: int | None
    created_at: datetime


class ServerAdminAccountEmail(ApiModel):
    id: UUID
    email: str
    is_primary: bool
    verified_at: datetime | None


class ServerAdminAccountSummary(ApiModel):
    id: UUID
    display_name: str
    primary_email: str | None
    email_verified: bool
    created_at: datetime
    disabled_at: datetime | None
    deletion_status: AccountDeletionStatus | None = None
    auth_methods: list[str]
    active_session_count: int
    active_membership_count: int


class ServerAdminAccountDetail(ServerAdminAccountSummary):
    emails: list[ServerAdminAccountEmail]
    passkey_count: int
    historical_membership_count: int
    last_session_activity_at: datetime | None
    mail_recovery_available: bool
    local_password_available: bool
    deletion_accepted_at: datetime | None = None


class ServerAdminAccountList(ApiModel):
    items: list[ServerAdminAccountSummary]
    total: int
    limit: int
    offset: int


class ServerAdminSpaceSummary(ApiModel):
    id: UUID
    created_at: datetime
    lifecycle_status: SpaceLifecycleStatus
    membership_count: int
    active_membership_count: int
    historical_membership_count: int
    left_membership_count: int
    removed_membership_count: int
    first_membership_at: datetime | None
    last_membership_change_at: datetime | None
    anomaly_codes: list[str]


class ServerAdminSpaceDetail(ServerAdminSpaceSummary):
    latest_membership_ended_at: datetime | None


class ServerAdminSpaceList(ApiModel):
    items: list[ServerAdminSpaceSummary]
    total: int
    limit: int
    offset: int


class ServerAdminEntitlementGrantView(ApiModel):
    """One historical grant row. Never exposes provider secrets/tokens."""

    id: UUID
    source_type: EntitlementSourceType
    status: EntitlementStatus
    tier: EntitlementTier
    effective_from: datetime
    effective_until: datetime | None
    capabilities: list[str] | None
    external_reference: str | None
    created_at: datetime


class ServerAdminSpaceEntitlementView(ApiModel):
    space_id: UUID
    tier: EntitlementTier
    status: EntitlementStatus
    effective_until: datetime | None
    is_in_grace_period: bool
    capabilities: list[str]
    grants: list[ServerAdminEntitlementGrantView]


class ServerAdminEntitlementGrantRequest(ApiModel):
    tier: EntitlementTier = EntitlementTier.PREMIUM
    capabilities: list[str] | None = None
    effective_until: datetime | None = None
    reason: str = Field(min_length=1, max_length=500)


class ServerAdminEntitlementRevokeRequest(ApiModel):
    reason: str = Field(min_length=1, max_length=500, default="revoked")


class ServerAdminAccountSuspensionUpdate(ApiModel):
    suspended: bool


class ServerAdminSessionRevocationResult(ApiModel):
    revoked_sessions: int


class ServerAdminEmailVerificationRequest(ApiModel):
    confirmation_email: str


class ServerAdminRecoveryProof(ApiModel):
    recovery_url: str
    expires_at: datetime


class ServerAdminRecoveryEmailResult(ApiModel):
    requested: bool


class ServerAdminAccountDeletionRequest(ApiModel):
    confirmation: str


class ServerAdminAccountDeletionResult(ApiModel):
    account_id: UUID
    accepted_at: datetime
    status: AccountDeletionStatus


def _settings_view(settings: InstanceAdministrationSettings) -> ServerAdminSettings:
    registration_enabled = bool(settings.registration_enabled)
    maintenance_mode = bool(settings.maintenance_mode)
    return ServerAdminSettings(
        registration_enabled=registration_enabled,
        maintenance_mode=maintenance_mode,
        effective_registration_enabled=(registration_enabled and not maintenance_mode),
        version=int(settings.version),
    )


def _job_count(session: Session, job_status: JobStatus) -> int:
    return session.execute(
        select(func.count()).select_from(Job).where(Job.status == job_status.value)
    ).scalar_one()


def _active_session_filters(current_time: datetime) -> tuple[Any, ...]:
    return (
        DeviceSession.revoked_at.is_(None),
        DeviceSession.expires_at > current_time,
        DeviceSession.absolute_expires_at > current_time,
    )


def _auth_methods(session: Session, account_id: UUID) -> list[str]:
    methods = set(
        session.execute(
            select(AuthIdentity.provider).where(AuthIdentity.account_id == account_id).distinct()
        ).scalars()
    )
    has_passkey = session.execute(
        select(exists().where(WebAuthnCredential.account_id == account_id))
    ).scalar_one()
    if has_passkey:
        methods.add(AuthProvider.PASSKEY.value)
    return sorted(methods)


def _account_summary(
    session: Session,
    account: Account,
    *,
    current_time: datetime,
) -> ServerAdminAccountSummary:
    primary = account_operations.primary_email(session, account.id)
    deletion_status_val = session.execute(
        select(AccountDeletion.status).where(AccountDeletion.account_id == account.id)
    ).scalar_one_or_none()
    active_sessions = session.execute(
        select(func.count())
        .select_from(DeviceSession)
        .where(DeviceSession.account_id == account.id, *_active_session_filters(current_time))
    ).scalar_one()
    active_memberships = session.execute(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.account_id == account.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one()
    return ServerAdminAccountSummary(
        id=account.id,
        display_name=account.display_name,
        primary_email=primary.email if primary is not None else None,
        email_verified=bool(primary is not None and primary.verified_at is not None),
        created_at=account.created_at,
        disabled_at=account.disabled_at,
        deletion_status=AccountDeletionStatus(deletion_status_val)
        if deletion_status_val is not None
        else None,
        auth_methods=_auth_methods(session, account.id),
        active_session_count=active_sessions,
        active_membership_count=active_memberships,
    )


def _account_detail(
    session: Session,
    account: Account,
    *,
    current_time: datetime,
) -> ServerAdminAccountDetail:
    summary = _account_summary(session, account, current_time=current_time)
    deletion_accepted_at = session.execute(
        select(AccountDeletion.accepted_at).where(AccountDeletion.account_id == account.id)
    ).scalar_one_or_none()
    email_rows = list(
        session.execute(
            select(AccountEmail)
            .where(AccountEmail.account_id == account.id)
            .order_by(AccountEmail.is_primary.desc(), AccountEmail.created_at.asc())
        )
        .scalars()
        .all()
    )
    passkey_count = session.execute(
        select(func.count())
        .select_from(WebAuthnCredential)
        .where(WebAuthnCredential.account_id == account.id)
    ).scalar_one()
    historical_memberships = session.execute(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.account_id == account.id,
            Membership.status != MembershipStatus.ACTIVE.value,
        )
    ).scalar_one()
    last_session_activity = session.execute(
        select(func.max(func.coalesce(DeviceSession.last_used_at, DeviceSession.created_at))).where(
            DeviceSession.account_id == account.id
        )
    ).scalar_one()
    runtime = get_runtime_settings()
    local_password_available = AuthProvider.LOCAL_PASSWORD.value in summary.auth_methods
    return ServerAdminAccountDetail(
        **summary.model_dump(),
        deletion_accepted_at=deletion_accepted_at,
        emails=[
            ServerAdminAccountEmail(
                id=email.id,
                email=email.email,
                is_primary=email.is_primary,
                verified_at=email.verified_at,
            )
            for email in email_rows
        ],
        passkey_count=passkey_count,
        historical_membership_count=historical_memberships,
        last_session_activity_at=last_session_activity,
        mail_recovery_available=(
            local_password_available and runtime.mail_transport is not MailTransport.NONE
        ),
        local_password_available=local_password_available,
    )


def _space_aggregate_subquery() -> Any:
    return (
        select(
            Membership.space_id.label("space_id"),
            func.count(Membership.id).label("membership_count"),
            func.sum(
                case(
                    (Membership.status == MembershipStatus.ACTIVE.value, 1),
                    else_=0,
                )
            ).label("active_membership_count"),
            func.sum(
                case(
                    (Membership.status == MembershipStatus.LEFT.value, 1),
                    else_=0,
                )
            ).label("left_membership_count"),
            func.sum(
                case(
                    (Membership.status == MembershipStatus.REMOVED.value, 1),
                    else_=0,
                )
            ).label("removed_membership_count"),
            func.min(Membership.created_at).label("first_membership_at"),
            func.max(
                func.coalesce(
                    Membership.ended_at,
                    Membership.joined_at,
                    Membership.created_at,
                )
            ).label("last_membership_change_at"),
            func.max(Membership.ended_at).label("latest_membership_ended_at"),
        )
        .group_by(Membership.space_id)
        .subquery()
    )


def _space_projection(aggregate: Any) -> tuple[Any, ...]:
    return (
        Space.id.label("id"),
        Space.created_at.label("created_at"),
        func.coalesce(aggregate.c.membership_count, 0).label("membership_count"),
        func.coalesce(aggregate.c.active_membership_count, 0).label("active_membership_count"),
        func.coalesce(aggregate.c.left_membership_count, 0).label("left_membership_count"),
        func.coalesce(aggregate.c.removed_membership_count, 0).label("removed_membership_count"),
        aggregate.c.first_membership_at,
        aggregate.c.last_membership_change_at,
        aggregate.c.latest_membership_ended_at,
    )


def _space_lifecycle_status(
    *, active_membership_count: int, membership_count: int
) -> SpaceLifecycleStatus:
    if active_membership_count > 0:
        return "active"
    if membership_count > 0:
        return "inactive"
    return "empty"


def _space_anomaly_codes(*, active_membership_count: int, membership_count: int) -> list[str]:
    codes: list[str] = []
    if membership_count == 0:
        codes.append("no_memberships")
    if active_membership_count > MAX_ACTIVE_PARTNERS:
        codes.append("too_many_active_memberships")
    return codes


def _space_summary_from_row(row: Any) -> ServerAdminSpaceSummary:
    values = row._mapping
    membership_count = int(values["membership_count"] or 0)
    active_membership_count = int(values["active_membership_count"] or 0)
    return ServerAdminSpaceSummary(
        id=values["id"],
        created_at=values["created_at"],
        lifecycle_status=_space_lifecycle_status(
            active_membership_count=active_membership_count,
            membership_count=membership_count,
        ),
        membership_count=membership_count,
        active_membership_count=active_membership_count,
        historical_membership_count=max(0, membership_count - active_membership_count),
        left_membership_count=int(values["left_membership_count"] or 0),
        removed_membership_count=int(values["removed_membership_count"] or 0),
        first_membership_at=values["first_membership_at"],
        last_membership_change_at=values["last_membership_change_at"],
        anomaly_codes=_space_anomaly_codes(
            active_membership_count=active_membership_count,
            membership_count=membership_count,
        ),
    )


def _space_detail_from_row(row: Any) -> ServerAdminSpaceDetail:
    summary = _space_summary_from_row(row)
    return ServerAdminSpaceDetail(
        **summary.model_dump(),
        latest_membership_ended_at=row._mapping["latest_membership_ended_at"],
    )


def _parse_space_id(space_id: str) -> UUID:
    parsed = parse_id(space_id)
    if parsed is None:
        raise NotFoundError("Space not found.", "SERVER_ADMIN_SPACE_NOT_FOUND")
    return parsed


def _parse_account_id(account_id: str) -> UUID:
    parsed = parse_id(account_id)
    if parsed is None:
        raise NotFoundError(
            "Account not found.",
            account_operations.ServerAdminAccountErrorCode.NOT_FOUND,
        )
    return parsed


@router.get(
    "/overview",
    response_model=ServerAdminOverview,
    responses=problem_responses(401, 403),
)
def get_server_admin_overview(
    _: CurrentServerAdmin,
    session: DbSession,
) -> ServerAdminOverview:
    """Return safe operational state for an authorized ServerAdmin."""
    settings = get_runtime_settings()
    current_time = now()

    account_count = session.execute(select(func.count()).select_from(Account)).scalar_one()
    enabled_account_count = session.execute(
        select(func.count()).select_from(Account).where(Account.disabled_at.is_(None))
    ).scalar_one()
    suspended_account_count = account_count - enabled_account_count
    verified_primary_email_count = session.execute(
        select(func.count())
        .select_from(AccountEmail)
        .where(
            AccountEmail.is_primary.is_(True),
            AccountEmail.verified_at.is_not(None),
        )
    ).scalar_one()
    unverified_primary_email_count = session.execute(
        select(func.count())
        .select_from(AccountEmail)
        .where(
            AccountEmail.is_primary.is_(True),
            AccountEmail.verified_at.is_(None),
        )
    ).scalar_one()

    active_space_count = session.execute(
        select(func.count(distinct(Membership.space_id))).where(
            Membership.status == MembershipStatus.ACTIVE.value
        )
    ).scalar_one()
    accounts_last_24h = session.execute(
        select(func.count())
        .select_from(Account)
        .where(Account.created_at >= current_time - timedelta(hours=24))
    ).scalar_one()
    accounts_last_7d = session.execute(
        select(func.count())
        .select_from(Account)
        .where(Account.created_at >= current_time - timedelta(days=7))
    ).scalar_one()
    accounts_last_30d = session.execute(
        select(func.count())
        .select_from(Account)
        .where(Account.created_at >= current_time - timedelta(days=30))
    ).scalar_one()

    active_session_count = session.execute(
        select(func.count())
        .select_from(DeviceSession)
        .where(*_active_session_filters(current_time))
    ).scalar_one()
    local_password_account_count = session.execute(
        select(func.count(distinct(AuthIdentity.account_id))).where(
            AuthIdentity.provider == AuthProvider.LOCAL_PASSWORD.value
        )
    ).scalar_one()
    oidc_account_count = session.execute(
        select(func.count(distinct(AuthIdentity.account_id))).where(
            AuthIdentity.provider == AuthProvider.OIDC.value
        )
    ).scalar_one()
    passkey_account_count = session.execute(
        select(func.count(distinct(WebAuthnCredential.account_id)))
    ).scalar_one()

    allowed_admin_emails = settings.server_admin_emails
    server_admin_verified_match_count = 0
    if allowed_admin_emails:
        server_admin_verified_match_count = session.execute(
            select(func.count(distinct(Account.id)))
            .select_from(Account)
            .join(AccountEmail, AccountEmail.account_id == Account.id)
            .where(
                Account.disabled_at.is_(None),
                AccountEmail.verified_at.is_not(None),
                AccountEmail.email.in_(allowed_admin_emails),
            )
        ).scalar_one()

    media_object_count = session.execute(
        select(func.count())
        .select_from(Attachment)
        .where(Attachment.status == AttachmentStatus.READY.value)
    ).scalar_one()
    media_stored_bytes = session.execute(
        select(func.coalesce(func.sum(Attachment.size), 0)).where(
            Attachment.status == AttachmentStatus.READY.value
        )
    ).scalar_one()

    last_successful_job_at = session.execute(
        select(func.max(Job.finished_at)).where(Job.status == JobStatus.SUCCEEDED.value)
    ).scalar_one()
    oldest_pending_job_at = session.execute(
        select(func.min(Job.created_at)).where(Job.status == JobStatus.PENDING.value)
    ).scalar_one()
    failed_jobs = (
        session.execute(
            select(Job)
            .where(Job.status == JobStatus.FAILED.value)
            .order_by(Job.finished_at.desc().nullslast(), Job.created_at.desc())
            .limit(5)
        )
        .scalars()
        .all()
    )
    jobs_failed = _job_count(session, JobStatus.FAILED)

    warning_codes: list[str] = []
    admin_settings = administration.get_access_state(session)
    if admin_settings.maintenance_mode:
        warning_codes.append("maintenance_mode_enabled")
    if not admin_settings.registration_enabled:
        warning_codes.append("registration_disabled")
    if not allowed_admin_emails:
        warning_codes.append("server_admin_allowlist_empty")
    elif server_admin_verified_match_count < len(allowed_admin_emails):
        warning_codes.append("server_admin_allowlist_unmatched")
    if settings.mail_transport is MailTransport.NONE and unverified_primary_email_count:
        warning_codes.append("mail_disabled_with_unverified_accounts")
    if jobs_failed:
        warning_codes.append("failed_jobs_present")

    return ServerAdminOverview(
        application_status="ok",
        database_status="ok",
        worker_status="no_heartbeat_signal",
        media_status="not_probed",
        deployment=settings.deployment.value,
        environment=settings.environment.value,
        build_revision=build_revision(),
        process_started_at=_PROCESS_STARTED_AT,
        public_base_url=settings.public_base_url,
        media_store=settings.media_store.value,
        mail_transport=settings.mail_transport.value,
        oidc_connection_count=len(settings.oidc_connections),
        demo_mode=settings.demo_mode,
        database_provider="postgresql",
        account_count=account_count,
        enabled_account_count=enabled_account_count,
        suspended_account_count=suspended_account_count,
        verified_primary_email_count=verified_primary_email_count,
        unverified_primary_email_count=unverified_primary_email_count,
        accounts_last_24h=accounts_last_24h,
        accounts_last_7d=accounts_last_7d,
        accounts_last_30d=accounts_last_30d,
        active_session_count=active_session_count,
        local_password_account_count=local_password_account_count,
        oidc_account_count=oidc_account_count,
        passkey_account_count=passkey_account_count,
        server_admin_allowlist_count=len(allowed_admin_emails),
        server_admin_verified_match_count=server_admin_verified_match_count,
        active_space_count=active_space_count,
        media_object_count=media_object_count,
        media_stored_bytes=int(media_stored_bytes or 0),
        jobs_pending=_job_count(session, JobStatus.PENDING),
        jobs_running=_job_count(session, JobStatus.RUNNING),
        jobs_failed=jobs_failed,
        oldest_pending_job_at=oldest_pending_job_at,
        last_successful_job_at=last_successful_job_at,
        recent_failed_jobs=[
            ServerAdminFailedJob(
                id=job.id,
                kind=job.kind,
                attempts=job.attempts,
                max_attempts=job.max_attempts,
                finished_at=job.finished_at,
            )
            for job in failed_jobs
        ],
        warning_codes=warning_codes,
    )


@router.get(
    "/spaces",
    response_model=ServerAdminSpaceList,
    responses=problem_responses(401, 403, 422),
)
def list_server_admin_spaces(
    _: CurrentServerAdmin,
    session: DbSession,
    query: Annotated[str | None, Query(max_length=64)] = None,
    space_status: Annotated[SpaceStatusFilter, Query(alias="status")] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ServerAdminSpaceList:
    """Return lifecycle metadata for Spaces without relationship content."""
    aggregate = _space_aggregate_subquery()
    membership_count = func.coalesce(aggregate.c.membership_count, 0)
    active_membership_count = func.coalesce(aggregate.c.active_membership_count, 0)
    conditions: list[Any] = []

    if query is not None and query.strip():
        parsed = parse_id(query.strip())
        if parsed is None:
            return ServerAdminSpaceList(items=[], total=0, limit=limit, offset=offset)
        conditions.append(Space.id == parsed)

    if space_status == "active":
        conditions.append(active_membership_count > 0)
    elif space_status == "inactive":
        conditions.extend((active_membership_count == 0, membership_count > 0))
    elif space_status == "empty":
        conditions.append(membership_count == 0)
    elif space_status == "anomaly":
        conditions.append(
            or_(
                membership_count == 0,
                active_membership_count > MAX_ACTIVE_PARTNERS,
            )
        )

    count_statement = (
        select(func.count())
        .select_from(Space)
        .outerjoin(aggregate, aggregate.c.space_id == Space.id)
    )
    if conditions:
        count_statement = count_statement.where(*conditions)
    total = session.execute(count_statement).scalar_one()

    statement = (
        select(*_space_projection(aggregate))
        .select_from(Space)
        .outerjoin(aggregate, aggregate.c.space_id == Space.id)
    )
    if conditions:
        statement = statement.where(*conditions)
    statement = (
        statement.order_by(Space.created_at.desc(), Space.id.desc()).limit(limit).offset(offset)
    )
    rows = session.execute(statement).all()
    return ServerAdminSpaceList(
        items=[_space_summary_from_row(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/spaces/{space_id}",
    response_model=ServerAdminSpaceDetail,
    responses=problem_responses(401, 403, 404),
)
def get_server_admin_space(
    _: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
) -> ServerAdminSpaceDetail:
    """Return one Space's privacy-safe lifecycle projection."""
    parsed = _parse_space_id(space_id)
    aggregate = _space_aggregate_subquery()
    statement = (
        select(*_space_projection(aggregate))
        .select_from(Space)
        .outerjoin(aggregate, aggregate.c.space_id == Space.id)
        .where(Space.id == parsed)
    )
    row = session.execute(statement).one_or_none()
    if row is None:
        raise NotFoundError("Space not found.", "SERVER_ADMIN_SPACE_NOT_FOUND")
    return _space_detail_from_row(row)


def _require_space(session: Session, space_id: str) -> UUID:
    parsed = _parse_space_id(space_id)
    if session.get(Space, parsed) is None:
        raise NotFoundError("Space not found.", "SERVER_ADMIN_SPACE_NOT_FOUND")
    return parsed


def _entitlement_grant_view(grant: EntitlementGrant) -> ServerAdminEntitlementGrantView:
    return ServerAdminEntitlementGrantView(
        id=grant.id,
        source_type=EntitlementSourceType(grant.source_type),
        status=EntitlementStatus(grant.status),
        tier=EntitlementTier(grant.tier),
        effective_from=grant.effective_from,
        effective_until=grant.effective_until,
        capabilities=grant.capabilities,
        external_reference=grant.external_reference,
        created_at=grant.created_at,
    )


def _space_entitlement_view(session: Session, space_id: UUID) -> ServerAdminSpaceEntitlementView:
    """Effective state plus full grant history, for operator transparency.

    This is a privileged ServerAdmin projection, distinct from the ordinary
    tenant-scoped `/spaces/{spaceId}/entitlements` read model: it additionally
    lists every historical grant so an operator can see how the current
    effective state was reached, without exposing provider secrets/tokens —
    only normalized identifiers already safe for the ordinary read model plus
    the opaque `external_reference` a provider adapter itself recorded.
    """
    effective = entitlements.get_effective_space_entitlement(session, space_id)
    grants = (
        session.execute(
            select(EntitlementGrant)
            .where(EntitlementGrant.space_id == space_id)
            .order_by(EntitlementGrant.created_at.desc())
        )
        .scalars()
        .all()
    )
    return ServerAdminSpaceEntitlementView(
        space_id=effective.space_id,
        tier=effective.tier,
        status=effective.status,
        effective_until=effective.effective_until,
        is_in_grace_period=effective.is_in_grace_period,
        capabilities=effective.capabilities,
        grants=[_entitlement_grant_view(grant) for grant in grants],
    )


@router.get(
    "/spaces/{space_id}/entitlement",
    response_model=ServerAdminSpaceEntitlementView,
    responses=problem_responses(401, 403, 404),
)
def get_server_admin_space_entitlement(
    _: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
) -> ServerAdminSpaceEntitlementView:
    """Return the effective entitlement state and full grant history for a Space."""
    parsed = _require_space(session, space_id)
    return _space_entitlement_view(session, parsed)


@router.post(
    "/spaces/{space_id}/entitlement/grants",
    response_model=ServerAdminSpaceEntitlementView,
    responses=problem_responses(401, 403, 404, 422),
)
def grant_server_admin_space_entitlement(
    body: ServerAdminEntitlementGrantRequest,
    admin: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
) -> ServerAdminSpaceEntitlementView:
    """Record a manual Premium grant for a Space (V1 launch entitlement source).

    This is the only entitlement source implemented for the first launch;
    Google Play/Stripe/Self-Hosted-license adapters are deliberately out of
    scope until a real launch channel requires them (docs/m6/
    ENTITLEMENT-BOUNDARY.md §7). It reuses the existing normalized
    `record_grant` source-update interface unchanged rather than adding a
    second grant-mutation path.
    """
    parsed = _require_space(session, space_id)
    entitlements.record_grant(
        session,
        space_id=parsed,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        tier=body.tier,
        effective_from=now(),
        effective_until=body.effective_until,
        account_id=admin.id,
        capabilities=body.capabilities,
        metadata={"reason": body.reason},
    )
    administration.record_action(
        session,
        actor_id=admin.id,
        action=AdministrationAction.SPACE_ENTITLEMENT_GRANTED,
        target_space_id=parsed,
    )
    return _space_entitlement_view(session, parsed)


@router.post(
    "/spaces/{space_id}/entitlement/grants/{grant_id}/revoke",
    response_model=ServerAdminSpaceEntitlementView,
    responses=problem_responses(401, 403, 404, 422),
)
def revoke_server_admin_space_entitlement_grant(
    body: ServerAdminEntitlementRevokeRequest,
    admin: CurrentServerAdmin,
    session: DbSession,
    space_id: Annotated[str, Path(max_length=64)],
    grant_id: Annotated[str, Path(max_length=64)],
) -> ServerAdminSpaceEntitlementView:
    """Revoke one grant (e.g. an admin mistake, abuse, or a refund/chargeback)."""
    parsed_space = _require_space(session, space_id)
    parsed_grant = parse_id(grant_id)
    if parsed_grant is None:
        raise NotFoundError("Entitlement grant not found.", "SERVER_ADMIN_GRANT_NOT_FOUND")

    grant = session.get(EntitlementGrant, parsed_grant)
    if grant is None or grant.space_id != parsed_space:
        raise NotFoundError("Entitlement grant not found.", "SERVER_ADMIN_GRANT_NOT_FOUND")

    entitlements.revoke_grant(session, parsed_grant, reason=body.reason)
    administration.record_action(
        session,
        actor_id=admin.id,
        action=AdministrationAction.SPACE_ENTITLEMENT_REVOKED,
        target_space_id=parsed_space,
    )
    return _space_entitlement_view(session, parsed_space)


@router.get(
    "/accounts",
    response_model=ServerAdminAccountList,
    responses=problem_responses(401, 403, 422),
)
def list_server_admin_accounts(
    _: CurrentServerAdmin,
    session: DbSession,
    query: Annotated[str | None, Query(max_length=320)] = None,
    account_status: Annotated[AccountStatusFilter, Query(alias="status")] = "all",
    verification: Annotated[VerificationFilter, Query()] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ServerAdminAccountList:
    """Return Account identity/security metadata without relationship content."""
    statement = select(Account)
    normalized_query = (query or "").strip().lower()
    if normalized_query:
        like = f"%{normalized_query}%"
        display_name_match = func.lower(Account.display_name).like(like)
        email_match = exists().where(
            AccountEmail.account_id == Account.id,
            AccountEmail.email.like(like),
        )
        account_id_match = parse_id(normalized_query)
        if account_id_match is None:
            statement = statement.where(or_(display_name_match, email_match))
        else:
            statement = statement.where(
                or_(
                    display_name_match,
                    email_match,
                    Account.id == account_id_match,
                )
            )
    if account_status == "active":
        statement = statement.where(Account.disabled_at.is_(None))
    elif account_status == "suspended":
        statement = statement.where(Account.disabled_at.is_not(None))

    primary_verified = exists().where(
        AccountEmail.account_id == Account.id,
        AccountEmail.is_primary.is_(True),
        AccountEmail.verified_at.is_not(None),
    )
    if verification == "verified":
        statement = statement.where(primary_verified)
    elif verification == "unverified":
        statement = statement.where(~primary_verified)

    total = session.execute(
        select(func.count()).select_from(statement.order_by(None).subquery())
    ).scalar_one()
    account_rows = list(
        session.execute(
            statement.order_by(Account.created_at.desc(), Account.id).offset(offset).limit(limit)
        )
        .scalars()
        .all()
    )
    current_time = now()
    return ServerAdminAccountList(
        items=[
            _account_summary(session, account, current_time=current_time)
            for account in account_rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/accounts/{accountId}",
    response_model=ServerAdminAccountDetail,
    responses=problem_responses(401, 403, 404),
)
def get_server_admin_account(
    _: CurrentServerAdmin,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
) -> ServerAdminAccountDetail:
    target = account_operations.require_account(session, _parse_account_id(account_id))
    return _account_detail(session, target, current_time=now())


@router.put(
    "/accounts/{accountId}/suspension",
    response_model=ServerAdminAccountDetail,
    responses=problem_responses(401, 403, 404, 422),
)
def update_server_admin_account_suspension(
    body: ServerAdminAccountSuspensionUpdate,
    admin: CurrentServerAdmin,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
) -> ServerAdminAccountDetail:
    target, _ = account_operations.set_suspended(
        session,
        actor=admin,
        target_account_id=_parse_account_id(account_id),
        suspended=body.suspended,
    )
    return _account_detail(session, target, current_time=now())


@router.post(
    "/accounts/{accountId}/sessions/revoke",
    response_model=ServerAdminSessionRevocationResult,
    responses=problem_responses(401, 403, 404),
)
def revoke_server_admin_account_sessions(
    admin: CurrentServerAdmin,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
) -> ServerAdminSessionRevocationResult:
    revoked = account_operations.revoke_account_sessions(
        session,
        actor=admin,
        target_account_id=_parse_account_id(account_id),
    )
    return ServerAdminSessionRevocationResult(revoked_sessions=revoked)


@router.post(
    "/accounts/{accountId}/emails/{accountEmailId}/verify",
    response_model=ServerAdminAccountEmail,
    responses=problem_responses(401, 403, 404, 422),
)
def verify_server_admin_account_email(
    body: ServerAdminEmailVerificationRequest,
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
    account_email_id: Annotated[str, Path(alias="accountEmailId")],
) -> ServerAdminAccountEmail:
    recent_auth.require_grant(
        session,
        admin,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
    )
    parsed_email_id = parse_id(account_email_id)
    if parsed_email_id is None:
        raise NotFoundError(
            "Account email not found.",
            account_operations.ServerAdminAccountErrorCode.EMAIL_NOT_FOUND,
        )
    email_record = account_operations.verify_account_email(
        session,
        actor=admin,
        target_account_id=_parse_account_id(account_id),
        account_email_id=parsed_email_id,
        confirmation_email=body.confirmation_email,
    )
    return ServerAdminAccountEmail(
        id=email_record.id,
        email=email_record.email,
        is_primary=email_record.is_primary,
        verified_at=email_record.verified_at,
    )


@router.post(
    "/accounts/{accountId}/recovery/email",
    response_model=ServerAdminRecoveryEmailResult,
    responses=problem_responses(401, 403, 404, 422, 503),
)
def request_server_admin_account_recovery_email(
    admin: CurrentServerAdmin,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
) -> ServerAdminRecoveryEmailResult:
    target = account_operations.require_account(session, _parse_account_id(account_id))
    if not target.is_active:
        raise ValidationError(
            "A suspended Account must be unsuspended before recovery.",
            account_operations.ServerAdminAccountErrorCode.ACCOUNT_DISABLED,
        )
    if accounts.local_identity(session, target) is None:
        raise ValidationError(
            "This Account has no local-password recovery path.",
            account_operations.ServerAdminAccountErrorCode.LOCAL_RECOVERY_UNAVAILABLE,
        )
    primary = account_operations.primary_email(session, target.id)
    if primary is None:
        raise ValidationError(
            "This Account has no primary email address.",
            account_operations.ServerAdminAccountErrorCode.EMAIL_NOT_FOUND,
        )
    cloud.request_recovery(session, email=primary.email, mail=mail_sender())
    administration.record_action(
        session,
        actor_id=admin.id,
        target_account_id=target.id,
        action=AdministrationAction.ACCOUNT_RECOVERY_EMAIL_REQUESTED,
    )
    return ServerAdminRecoveryEmailResult(requested=True)


@router.post(
    "/accounts/{accountId}/recovery/operator",
    response_model=ServerAdminRecoveryProof,
    responses=problem_responses(401, 403, 404, 422),
)
def issue_server_admin_operator_recovery(
    response: Response,
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
) -> ServerAdminRecoveryProof:
    recent_auth.require_grant(
        session,
        admin,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
    )
    proof = account_operations.issue_operator_recovery(
        session,
        actor=admin,
        target_account_id=_parse_account_id(account_id),
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return ServerAdminRecoveryProof(
        recovery_url=proof.recovery_url,
        expires_at=proof.expires_at,
    )


@router.post(
    "/accounts/{accountId}/deletion",
    response_model=ServerAdminAccountDeletionResult,
    responses=problem_responses(401, 403, 404, 422, 503),
)
def delete_server_admin_account(
    admin: CurrentServerAdmin,
    device_session: CurrentSession,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
    body: ServerAdminAccountDeletionRequest,
) -> ServerAdminAccountDeletionResult:
    recent_auth.require_grant(
        session,
        admin,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
    )
    parsed_id = _parse_account_id(account_id)
    deletion = account_operations.delete_account(
        session,
        actor=admin,
        target_account_id=parsed_id,
        confirmation=body.confirmation,
    )
    return ServerAdminAccountDeletionResult(
        account_id=parsed_id,
        accepted_at=deletion.accepted_at,
        status=AccountDeletionStatus(deletion.status),
    )


@router.get(
    "/settings",
    response_model=ServerAdminSettings,
    responses=problem_responses(401, 403),
)
def get_server_admin_settings(
    _: CurrentServerAdmin,
    session: DbSession,
) -> ServerAdminSettings:
    return _settings_view(administration.get_settings(session))


@router.put(
    "/settings/registration",
    response_model=ServerAdminSettings,
    responses=problem_responses(401, 403, 422),
)
def update_registration_setting(
    body: ServerAdminSettingUpdate,
    admin: CurrentServerAdmin,
    session: DbSession,
) -> ServerAdminSettings:
    settings = administration.update_setting(
        session,
        actor_id=admin.id,
        setting=AdministrationSetting.REGISTRATION_ENABLED,
        enabled=body.enabled,
    )
    return _settings_view(settings)


@router.put(
    "/settings/maintenance",
    response_model=ServerAdminSettings,
    responses=problem_responses(401, 403, 422),
)
def update_maintenance_setting(
    body: ServerAdminSettingUpdate,
    admin: CurrentServerAdmin,
    session: DbSession,
) -> ServerAdminSettings:
    settings = administration.update_setting(
        session,
        actor_id=admin.id,
        setting=AdministrationSetting.MAINTENANCE_MODE,
        enabled=body.enabled,
    )
    return _settings_view(settings)


@router.get(
    "/activity",
    response_model=list[ServerAdminActivityItem],
    responses=problem_responses(401, 403),
)
def get_server_admin_activity(
    _: CurrentServerAdmin,
    session: DbSession,
) -> list[ServerAdminActivityItem]:
    return [
        ServerAdminActivityItem(
            id=event.id,
            actor_id=event.actor_id,
            setting=event.setting,
            previous_value=event.previous_value,
            new_value=event.new_value,
            created_at=event.created_at,
        )
        for event in administration.recent_events(session)
    ]


@router.get(
    "/activity/actions",
    response_model=list[ServerAdminActionActivityItem],
    responses=problem_responses(401, 403),
)
def get_server_admin_action_activity(
    _: CurrentServerAdmin,
    session: DbSession,
) -> list[ServerAdminActionActivityItem]:
    return [
        ServerAdminActionActivityItem(
            id=event.id,
            actor_id=event.actor_id,
            target_account_id=event.target_account_id,
            target_space_id=event.target_space_id,
            action=event.action,
            effect_count=event.effect_count,
            created_at=event.created_at,
        )
        for event in administration.recent_action_events(session)
    ]
