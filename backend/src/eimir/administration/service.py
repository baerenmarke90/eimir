"""Application service for registration and maintenance administration."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import case, func, literal, or_, select, union_all
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.administration.models import (
    AdministrationAction,
    AdministrationSetting,
    InstanceAdministrationActionEvent,
    InstanceAdministrationEvent,
    InstanceAdministrationSettings,
)
from eimir.core.errors import ErrorCode, ForbiddenError, ServiceUnavailableError


@dataclass(frozen=True, slots=True)
class PrivilegedAuditRecord:
    """One content-free privileged administration event."""

    id: UUID
    category: str
    action: str
    actor_id: UUID | None
    target_account_id: UUID | None
    target_space_id: UUID | None
    previous_value: bool | None
    new_value: bool | None
    effect_count: int | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class PrivilegedAuditResult:
    items: tuple[PrivilegedAuditRecord, ...]
    total: int


DESTRUCTIVE_ACTIONS = frozenset({AdministrationAction.ACCOUNT_DELETION_REQUESTED.value})


@dataclass(frozen=True, slots=True)
class InstanceAccessState:
    """Stored and effective public access state."""

    registration_enabled: bool
    maintenance_mode: bool

    @property
    def effective_registration_enabled(self) -> bool:
        return self.registration_enabled and not self.maintenance_mode


def get_settings(session: Session, *, for_update: bool = False) -> InstanceAdministrationSettings:
    """Return the singleton settings row, creating safe defaults if necessary."""
    statement = select(InstanceAdministrationSettings).where(
        InstanceAdministrationSettings.singleton_key == 1
    )
    if for_update:
        statement = statement.with_for_update()
    settings = session.execute(statement).scalar_one_or_none()
    if settings is None:
        # SELECT ... FOR UPDATE cannot lock a row that does not exist. Use the
        # migration-compatible PostgreSQL upsert so concurrent first requests
        # cannot both create the singleton and turn a normal race into a 500.
        session.execute(
            insert(InstanceAdministrationSettings)
            .values(
                singleton_key=1,
                registration_enabled=True,
                maintenance_mode=False,
                version=1,
            )
            .on_conflict_do_nothing(index_elements=[InstanceAdministrationSettings.singleton_key])
        )
        settings = session.execute(statement).scalar_one()
    return settings


def get_access_state(session: Session) -> InstanceAccessState:
    settings = get_settings(session)
    return InstanceAccessState(
        registration_enabled=settings.registration_enabled,
        maintenance_mode=settings.maintenance_mode,
    )


def ensure_normal_operation(session: Session) -> None:
    """Reject ordinary product traffic while instance maintenance is active."""
    if get_access_state(session).maintenance_mode:
        raise ServiceUnavailableError(
            "eimir. is temporarily unavailable for maintenance.",
            ErrorCode.MAINTENANCE_MODE,
        )


def ensure_new_account_registration_allowed(session: Session) -> None:
    """Reject creation of a new non-bootstrap account when policy disallows it."""
    state = get_access_state(session)
    if state.maintenance_mode:
        raise ServiceUnavailableError(
            "eimir. is temporarily unavailable for maintenance.",
            ErrorCode.MAINTENANCE_MODE,
        )
    if not state.registration_enabled:
        raise ForbiddenError(
            "New account registration is disabled by the administrator.",
            ErrorCode.REGISTRATION_DISABLED,
        )


def update_setting(
    session: Session,
    *,
    actor_id: UUID,
    setting: AdministrationSetting,
    enabled: bool,
) -> InstanceAdministrationSettings:
    """Change one privileged setting and audit actual state transitions."""
    settings = get_settings(session, for_update=True)
    attribute = setting.value
    previous = bool(getattr(settings, attribute))
    if previous == enabled:
        return settings

    setattr(settings, attribute, enabled)
    session.add(
        InstanceAdministrationEvent(
            actor_id=actor_id,
            setting=setting.value,
            previous_value=previous,
            new_value=enabled,
        )
    )
    session.flush()
    return settings


def record_action(
    session: Session,
    *,
    actor_id: UUID | None,
    action: AdministrationAction,
    target_account_id: UUID | None = None,
    target_space_id: UUID | None = None,
    effect_count: int | None = None,
) -> InstanceAdministrationActionEvent:
    """Record one privileged Account/Space operation without storing user payloads."""
    event = InstanceAdministrationActionEvent(
        actor_id=actor_id,
        target_account_id=target_account_id,
        target_space_id=target_space_id,
        action=action.value,
        effect_count=effect_count,
    )
    session.add(event)
    session.flush()
    return event


def recent_events(session: Session, *, limit: int = 20) -> list[InstanceAdministrationEvent]:
    return list(
        session.execute(
            select(InstanceAdministrationEvent)
            .order_by(InstanceAdministrationEvent.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )


def recent_action_events(
    session: Session, *, limit: int = 50
) -> list[InstanceAdministrationActionEvent]:
    return list(
        session.execute(
            select(InstanceAdministrationActionEvent)
            .order_by(InstanceAdministrationActionEvent.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )

def privileged_audit_events(
    session: Session,
    *,
    category: str = "all",
    action: str | None = None,
    actor_id: UUID | None = None,
    target_id: UUID | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = 25,
    offset: int = 0,
) -> PrivilegedAuditResult:
    """Return one privacy-safe, paginated projection across both audit stores."""

    branches = []

    include_settings = category in {"all", "settings"} and target_id is None
    if include_settings:
        settings_conditions = []
        if action is not None:
            settings_conditions.append(InstanceAdministrationEvent.setting == action)
        if actor_id is not None:
            settings_conditions.append(InstanceAdministrationEvent.actor_id == actor_id)
        if created_from is not None:
            settings_conditions.append(InstanceAdministrationEvent.created_at >= created_from)
        if created_to is not None:
            settings_conditions.append(InstanceAdministrationEvent.created_at <= created_to)

        settings_query = select(
            InstanceAdministrationEvent.id.label("id"),
            literal("settings").label("category"),
            InstanceAdministrationEvent.setting.label("action"),
            InstanceAdministrationEvent.actor_id.label("actor_id"),
            literal(None).label("target_account_id"),
            literal(None).label("target_space_id"),
            InstanceAdministrationEvent.previous_value.label("previous_value"),
            InstanceAdministrationEvent.new_value.label("new_value"),
            literal(None).label("effect_count"),
            InstanceAdministrationEvent.created_at.label("created_at"),
        )
        if settings_conditions:
            settings_query = settings_query.where(*settings_conditions)
        branches.append(settings_query)

    if category in {"all", "accounts", "spaces", "destructive"}:
        action_conditions = []
        if action is not None:
            action_conditions.append(InstanceAdministrationActionEvent.action == action)
        if actor_id is not None:
            action_conditions.append(InstanceAdministrationActionEvent.actor_id == actor_id)
        if target_id is not None:
            action_conditions.append(
                or_(
                    InstanceAdministrationActionEvent.target_account_id == target_id,
                    InstanceAdministrationActionEvent.target_space_id == target_id,
                )
            )
        if created_from is not None:
            action_conditions.append(InstanceAdministrationActionEvent.created_at >= created_from)
        if created_to is not None:
            action_conditions.append(InstanceAdministrationActionEvent.created_at <= created_to)

        if category == "accounts":
            action_conditions.extend(
                (
                    InstanceAdministrationActionEvent.target_account_id.is_not(None),
                    InstanceAdministrationActionEvent.action.not_in(DESTRUCTIVE_ACTIONS),
                )
            )
        elif category == "spaces":
            action_conditions.append(InstanceAdministrationActionEvent.target_space_id.is_not(None))
        elif category == "destructive":
            action_conditions.append(InstanceAdministrationActionEvent.action.in_(DESTRUCTIVE_ACTIONS))

        action_category = case(
            (
                InstanceAdministrationActionEvent.action.in_(DESTRUCTIVE_ACTIONS),
                literal("destructive"),
            ),
            (
                InstanceAdministrationActionEvent.target_space_id.is_not(None),
                literal("spaces"),
            ),
            else_=literal("accounts"),
        ).label("category")
        actions_query = select(
            InstanceAdministrationActionEvent.id.label("id"),
            action_category,
            InstanceAdministrationActionEvent.action.label("action"),
            InstanceAdministrationActionEvent.actor_id.label("actor_id"),
            InstanceAdministrationActionEvent.target_account_id.label("target_account_id"),
            InstanceAdministrationActionEvent.target_space_id.label("target_space_id"),
            literal(None).label("previous_value"),
            literal(None).label("new_value"),
            InstanceAdministrationActionEvent.effect_count.label("effect_count"),
            InstanceAdministrationActionEvent.created_at.label("created_at"),
        )
        if action_conditions:
            actions_query = actions_query.where(*action_conditions)
        branches.append(actions_query)

    if not branches:
        return PrivilegedAuditResult(items=(), total=0)

    combined = (
        branches[0].subquery()
        if len(branches) == 1
        else union_all(*branches).subquery()
    )
    total = session.execute(select(func.count()).select_from(combined)).scalar_one()
    rows = session.execute(
        select(combined)
        .order_by(combined.c.created_at.desc(), combined.c.id.desc())
        .limit(limit)
        .offset(offset)
    ).mappings()

    return PrivilegedAuditResult(
        items=tuple(
            PrivilegedAuditRecord(
                id=row["id"],
                category=row["category"],
                action=row["action"],
                actor_id=row["actor_id"],
                target_account_id=row["target_account_id"],
                target_space_id=row["target_space_id"],
                previous_value=row["previous_value"],
                new_value=row["new_value"],
                effect_count=row["effect_count"],
                created_at=row["created_at"],
            )
            for row in rows
        ),
        total=total,
    )
