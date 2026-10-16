"""Space endpoints.

Every ordinary content access passes through the tenant context. The #518
self-exit command is the deliberate exception: it must resolve the caller's
historical Membership itself so a repeated request can remain idempotent after
the active tenant context has already disappeared.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Self, cast
from uuid import UUID

from fastapi import APIRouter, Path, Response, status
from pydantic import ConfigDict, model_validator
from pydantic.json_schema import SkipJsonSchema
from sqlalchemy import select

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import CurrentAccount, DbSession, Tenant, TenantContext
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.clock import today_in
from eimir.core.errors import NotFoundError
from eimir.core.ids import parse_id
from eimir.db.mixins import INITIAL_VERSION
from eimir.identity.models import Account
from eimir.relationship import configuration as configuration_service
from eimir.relationship import duration as duration_calc
from eimir.relationship import offboarding
from eimir.relationship import presence as presence_service
from eimir.relationship import profile as profile_service
from eimir.relationship import service as relationship_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    DurationDisplayMode,
    Membership,
    MembershipStatus,
    SpaceConfiguration,
    SpaceProfile,
)

router = APIRouter(tags=["spaces"])

ETAG_HEADERS = {
    "ETag": {
        "description": (
            "Resource version. Send it unchanged in the next write request's `If-Match` header."
        ),
        "schema": {"type": "string"},
    }
}
"""ETag is part of the contract because clients cannot write without it."""


class PartnerView(ApiModel):
    """Account projection exposed through a space response.

    This is deliberately an allowlist. Accounts also contain authentication
    and contact data that do not belong in a space response; serializing the
    general model would eventually expose such fields by accident.
    """

    id: UUID
    display_name: str


class SpaceView(ApiModel):
    id: UUID
    created_at: datetime
    partners: list[PartnerView]
    relationship_started_on: str | None = None
    show_relationship_duration: bool = True
    duration_display_mode: str = "YEARS_MONTHS"
    relationship_days: int | None = None
    relationship_years: int | None = None
    relationship_months: int | None = None


class SpaceProfileView(ApiModel):
    """Relationship profile of a space.

    ``version`` is the state a later write must supply through ``If-Match``.
    The response also carries that version as an ETag.
    """

    space_id: UUID
    version: int
    relationship_started_on: date | None = None
    show_relationship_duration: bool = True
    duration_display_mode: DurationDisplayMode = DurationDisplayMode.YEARS_MONTHS
    relationship_days: int | None = None
    relationship_years: int | None = None
    relationship_months: int | None = None


class SpaceProfileUpdate(ApiModel):
    """Complete replacement state for a relationship profile.

    All three fields are required. Otherwise an omitted field could not be
    distinguished from clearing it, and that distinction determines whether a
    relationship start date is preserved or removed. ``relationshipStartedOn``
    is explicitly removed by sending ``null``.
    """

    relationship_started_on: date | None
    show_relationship_duration: bool
    duration_display_mode: DurationDisplayMode


class SpaceConfigurationView(ApiModel):
    """Shared typed module configuration visible to both active partners."""

    space_id: UUID
    version: int
    can_manage_space_configuration: bool
    vibe_check_enabled: bool
    energy_check_in_enabled: bool
    love_notes_enabled: bool
    support_gestures_enabled: bool
    shared_achievements_enabled: bool
    daily_questions_enabled: bool
    daily_context_timezone: str | None
    vibe_visibility_mode: DailyCheckInVisibilityMode
    energy_visibility_mode: DailyCheckInVisibilityMode


class SpaceConfigurationUpdate(ApiModel):
    """Partial typed update for Space-wide module configuration."""

    model_config = ConfigDict(extra="forbid")

    vibe_check_enabled: bool | SkipJsonSchema[None] = None
    energy_check_in_enabled: bool | SkipJsonSchema[None] = None
    love_notes_enabled: bool | SkipJsonSchema[None] = None
    support_gestures_enabled: bool | SkipJsonSchema[None] = None
    shared_achievements_enabled: bool | SkipJsonSchema[None] = None
    daily_questions_enabled: bool | SkipJsonSchema[None] = None
    daily_context_timezone: str | None = None
    vibe_visibility_mode: DailyCheckInVisibilityMode | SkipJsonSchema[None] = None
    energy_visibility_mode: DailyCheckInVisibilityMode | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one configuration field must be supplied")

        nullable_fields = {"daily_context_timezone"}
        for field_name in self.model_fields_set - nullable_fields:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} must not be null")
        return self


class SpaceMembershipExitView(ApiModel):
    """Safe lifecycle state after self-exit from one Space."""

    space_id: UUID
    status: MembershipStatus
    ended_at: datetime | None


class PartnerPresenceView(ApiModel):
    """Privacy-bounded state of the other active partner in this Space."""

    state: Literal["ACTIVE", "RECENT"] | None


def _add_duration(
    view: SpaceProfileView | SpaceView,
    profile: SpaceProfile,
    today: date,
) -> None:
    """Add relationship duration when the profile permits it to be shown.

    When display is disabled, the value is not transmitted at all. A value the
    client is merely told to hide has still been disclosed.
    """
    if not profile.show_relationship_duration or profile.relationship_started_on is None:
        return

    duration = duration_calc.since(profile.relationship_started_on, today)
    if duration is None:
        return

    view.relationship_days = duration.days
    view.relationship_years = duration.years
    view.relationship_months = duration.months


def _profile_view(space_id: UUID, profile: SpaceProfile | None, today: date) -> SpaceProfileView:
    """Build the profile view, including for a space without a profile row.

    A space without a profile row is legacy state. Reads project the same
    defaults that the first write would create, including the version that
    write will observe. Reads intentionally do not create database state.
    """
    if profile is None:
        return SpaceProfileView(space_id=space_id, version=INITIAL_VERSION)

    view = SpaceProfileView(
        space_id=space_id,
        version=profile.version,
        relationship_started_on=profile.relationship_started_on,
        show_relationship_duration=profile.show_relationship_duration,
        duration_display_mode=DurationDisplayMode(profile.duration_display_mode),
    )
    _add_duration(view, profile, today)
    return view


def _configuration_view(
    tenant: TenantContext,
    configuration: SpaceConfiguration,
) -> SpaceConfigurationView:
    return SpaceConfigurationView(
        space_id=tenant.space_id,
        version=configuration.version,
        can_manage_space_configuration=relationship_service.can_manage_space_configuration(
            tenant.membership.space,
            tenant.membership,
        ),
        vibe_check_enabled=configuration.vibe_check_enabled,
        energy_check_in_enabled=configuration.energy_check_in_enabled,
        love_notes_enabled=configuration.love_notes_enabled,
        support_gestures_enabled=configuration.support_gestures_enabled,
        shared_achievements_enabled=configuration.shared_achievements_enabled,
        daily_questions_enabled=configuration.daily_questions_enabled,
        daily_context_timezone=configuration.daily_context_timezone,
        vibe_visibility_mode=DailyCheckInVisibilityMode(configuration.vibe_visibility_mode),
        energy_visibility_mode=DailyCheckInVisibilityMode(configuration.energy_visibility_mode),
    )


def _require_configuration(session: DbSession, space_id: UUID) -> SpaceConfiguration:
    configuration = configuration_service.load(session, space_id)
    if configuration is None:
        # Migration 0063 backfills every existing Space and create_space()
        # persists this row for every new Space. Treat a missing row as an
        # unavailable Space resource rather than fabricating client-side state.
        raise NotFoundError(
            "Space configuration not found.",
            relationship_service.SpaceErrorCode.NOT_FOUND,
        )
    return configuration


def _today_for(tenant: TenantContext) -> date:
    """Return today's date from the reading account's timezone.

    Shared-day counters and anniversaries roll over at midnight where that
    person is located. ``today_utc()`` would be up to one day ahead for users
    west of UTC and one day behind for users east of UTC.
    """
    return today_in(tenant.account.timezone)


@router.post(
    "/spaces",
    response_model=SpaceView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(
        401,
        409,
        descriptions={
            409: (
                "`ACCOUNT_HAS_ACTIVE_SPACE`: the Account already has an active Membership. "
                "Nothing was created; select the existing Space through `GET /auth/memberships`."
            )
        },
    ),
    summary="Create the authenticated Account's own private Space",
)
def create_space(account: CurrentAccount, session: DbSession) -> SpaceView:
    """Create a private couple Space with the caller as its first partner.

    The request has no body: the founder is always the authenticated Account.
    Allowed only while the Account has no active Membership, and serialized per
    Account, so retries and concurrent requests yield exactly one Space. Invite
    the partner afterwards through the ordinary invitation endpoints.
    """
    space = relationship_service.create_first_space(session, account)
    return SpaceView(
        id=space.id,
        created_at=space.created_at,
        partners=[PartnerView(id=account.id, display_name=account.display_name or "")],
    )


@router.get(
    "/spaces/{spaceId}",
    response_model=SpaceView,
    responses=problem_responses(401, 404),
)
def get_space(tenant: Tenant, session: DbSession) -> SpaceView:
    profile = profile_service.load(session, tenant.space_id)

    # Query through memberships rather than Accounts directly so the response
    # cannot include a person who is not a member of this space.
    members = (
        session.execute(
            select(Account)
            .join(Membership, Membership.account_id == Account.id)
            .where(
                Membership.space_id == tenant.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Account.created_at)
        )
        .scalars()
        .all()
    )

    view = SpaceView(
        id=tenant.space_id,
        created_at=tenant.membership.space.created_at,
        partners=[PartnerView(id=a.id, display_name=a.display_name or "") for a in members],
    )

    if profile is None:
        return view

    view.show_relationship_duration = profile.show_relationship_duration
    view.duration_display_mode = profile.duration_display_mode
    if profile.relationship_started_on is not None:
        view.relationship_started_on = profile.relationship_started_on.isoformat()

    _add_duration(view, profile, _today_for(tenant))
    return view


@router.get(
    "/spaces/{spaceId}/presence",
    response_model=PartnerPresenceView,
    operation_id="getPartnerPresence",
    responses=problem_responses(401, 404),
)
def get_partner_presence(tenant: Tenant, session: DbSession) -> PartnerPresenceView:
    """Return only the bounded semantic state of the other active partner.

    No timestamp is exposed. Missing, stale, or absent partner presence is
    represented as null so this cannot become a last-seen surface.
    """
    return PartnerPresenceView(
        state=presence_service.partner_state(
            session,
            space_id=tenant.space_id,
            viewer_account_id=tenant.account.id,
        )
    )


@router.post(
    "/spaces/{spaceId}/presence",
    response_model=PartnerPresenceView,
    operation_id="touchPresence",
    responses=problem_responses(401, 404),
)
def touch_presence(tenant: Tenant, session: DbSession) -> PartnerPresenceView:
    """Renew caller presence and return the partner's bounded state."""
    presence_service.touch(
        session,
        space_id=tenant.space_id,
        account_id=tenant.account.id,
    )
    return PartnerPresenceView(
        state=presence_service.partner_state(
            session,
            space_id=tenant.space_id,
            viewer_account_id=tenant.account.id,
        )
    )


@router.post(
    "/spaces/{spaceId}/membership/leave",
    response_model=SpaceMembershipExitView,
    responses=problem_responses(401, 403, 404),
    summary="Leave the authenticated Account's Membership in this Space",
)
def leave_space(
    account: CurrentAccount,
    session: DbSession,
    space_id_raw: Annotated[str, Path(alias="spaceId")],
) -> SpaceMembershipExitView:
    """End only the caller's own Membership, never the partner's.

    This route intentionally does not depend on ``Tenant``. Once the first
    request commits, the normal tenant dependency correctly stops authorizing
    this Space; resolving the caller's historical Membership directly is what
    lets a retry return the same safe ended state instead of creating another
    lifecycle.
    """
    space_id = parse_id(space_id_raw)
    if space_id is None:
        raise NotFoundError("Space not found.", relationship_service.SpaceErrorCode.NOT_FOUND)

    result = offboarding.leave_space(session, account, space_id)
    return SpaceMembershipExitView(
        space_id=space_id,
        status=MembershipStatus(result.membership.status),
        ended_at=result.membership.ended_at,
    )


@router.get(
    "/spaces/{spaceId}/configuration",
    response_model=SpaceConfigurationView,
    operation_id="getSpaceConfiguration",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404),
    },
)
def get_space_configuration(
    tenant: Tenant,
    session: DbSession,
    response: Response,
) -> SpaceConfigurationView:
    """Return authoritative shared module configuration and caller capability."""
    configuration = _require_configuration(session, tenant.space_id)
    view = _configuration_view(tenant, configuration)
    response.headers["ETag"] = etag_for(view.version)
    return view


@router.patch(
    "/spaces/{spaceId}/configuration",
    response_model=SpaceConfigurationView,
    operation_id="updateSpaceConfiguration",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            403,
            404,
            409,
            422,
            descriptions={
                403: (
                    "`SPACE_CONFIGURATION_MANAGEMENT_REQUIRED`: the caller may read "
                    "this Space configuration but is not its persisted configuration manager."
                ),
                409: (
                    "The supplied version is no longer current. Nothing was changed; "
                    "reload the latest configuration before retrying."
                ),
            },
        ),
    },
)
def update_space_configuration(
    tenant: Tenant,
    session: DbSession,
    response: Response,
    body: SpaceConfigurationUpdate,
    expected_version: IfMatchVersion,
) -> SpaceConfigurationView:
    """Apply a typed partial update under the existing If-Match contract."""
    current = _require_configuration(session, tenant.space_id)
    changed = body.model_fields_set

    configuration = configuration_service.update(
        session,
        tenant.space_id,
        tenant.membership,
        expected_version=expected_version,
        vibe_check_enabled=(
            cast(bool, body.vibe_check_enabled)
            if "vibe_check_enabled" in changed
            else current.vibe_check_enabled
        ),
        energy_check_in_enabled=(
            cast(bool, body.energy_check_in_enabled)
            if "energy_check_in_enabled" in changed
            else current.energy_check_in_enabled
        ),
        love_notes_enabled=(
            cast(bool, body.love_notes_enabled)
            if "love_notes_enabled" in changed
            else current.love_notes_enabled
        ),
        support_gestures_enabled=(
            cast(bool, body.support_gestures_enabled)
            if "support_gestures_enabled" in changed
            else current.support_gestures_enabled
        ),
        shared_achievements_enabled=(
            cast(bool, body.shared_achievements_enabled)
            if "shared_achievements_enabled" in changed
            else current.shared_achievements_enabled
        ),
        daily_questions_enabled=(
            cast(bool, body.daily_questions_enabled)
            if "daily_questions_enabled" in changed
            else current.daily_questions_enabled
        ),
        daily_context_timezone=(
            body.daily_context_timezone
            if "daily_context_timezone" in changed
            else current.daily_context_timezone
        ),
        vibe_visibility_mode=(
            cast(DailyCheckInVisibilityMode, body.vibe_visibility_mode)
            if "vibe_visibility_mode" in changed
            else DailyCheckInVisibilityMode(current.vibe_visibility_mode)
        ),
        energy_visibility_mode=(
            cast(DailyCheckInVisibilityMode, body.energy_visibility_mode)
            if "energy_visibility_mode" in changed
            else DailyCheckInVisibilityMode(current.energy_visibility_mode)
        ),
    )

    view = _configuration_view(tenant, configuration)
    response.headers["ETag"] = etag_for(view.version)
    return view


@router.get(
    "/spaces/{spaceId}/profile",
    response_model=SpaceProfileView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404),
    },
)
def get_space_profile(tenant: Tenant, session: DbSession, response: Response) -> SpaceProfileView:
    view = _profile_view(
        tenant.space_id,
        profile_service.load(session, tenant.space_id),
        _today_for(tenant),
    )
    response.headers["ETag"] = etag_for(view.version)
    return view


@router.put(
    "/spaces/{spaceId}/profile",
    response_model=SpaceProfileView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            404,
            409,
            422,
            descriptions={
                409: (
                    "The supplied version is no longer current. Nothing was changed; "
                    "reload the latest state before retrying."
                )
            },
        ),
    },
)
def update_space_profile(
    tenant: Tenant,
    session: DbSession,
    response: Response,
    body: SpaceProfileUpdate,
    expected_version: IfMatchVersion,
) -> SpaceProfileView:
    """Replace the relationship profile.

    The caller supplies the version it read through ``If-Match``. If the
    partner has written in the meantime, the endpoint returns 409 and changes
    nothing; otherwise simultaneous edits could silently overwrite each other.
    """
    today = _today_for(tenant)
    profile = profile_service.update(
        session,
        tenant.space_id,
        expected_version=expected_version,
        relationship_started_on=body.relationship_started_on,
        show_relationship_duration=body.show_relationship_duration,
        duration_display_mode=body.duration_display_mode,
        today=today,
    )

    view = _profile_view(tenant.space_id, profile, today)
    response.headers["ETag"] = etag_for(view.version)
    return view
