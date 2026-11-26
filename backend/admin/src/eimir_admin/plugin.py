"""The operator plugin object (#2189).

This object is what Core sees of the operator tools through the seam; it is
registered as the entry point ``admin`` of the group ``eimir.plugins`` in the
``eimir-admin`` distribution (``backend/admin/pyproject.toml``). Hooks the
plugin does not use return empty values.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from eimir.deployment.revision import build_revision
from eimir.engagement.models import EngagementTarget
from eimir.plugins.contract import (
    PLUGIN_SEAM_VERSION,
    AttachmentReadRule,
    CoreNotifications,
    MigrationSpec,
    TargetRule,
)
from eimir.plugins.manifest import ADMIN_CAPABILITIES
from eimir_admin.tracker.settings import load_admin_settings

if TYPE_CHECKING:
    from fastapi import APIRouter
    from sqlalchemy.orm import Session

    from eimir.authorization import AuthorizationContext
    from eimir.config import Settings
    from eimir.demo.service import DemoSeedResult
    from eimir.domain.events import EventType
    from eimir.jobs.worker import JobRegistry
    from eimir.outbox.models import OutboxEvent
    from eimir.wish_selections.date_idea_contract import DateIdeaSource


class AdminPlugin:
    """The operator plugin of the ``eimir-admin`` distribution."""

    name = "admin"
    seam_version = PLUGIN_SEAM_VERSION

    @property
    def core_revision(self) -> str:
        # Built and shipped in the same image as Core, so it is Core's own revision.
        return build_revision()

    def capabilities(self) -> frozenset[str]:
        return ADMIN_CAPABILITIES

    def model_modules(self) -> Sequence[str]:
        return ("eimir_admin.support_tickets.models", "eimir_admin.reply_templates.models")

    def routers(self) -> Sequence[APIRouter]:
        from eimir_admin.api import support_reports

        return (support_reports.router,)

    def register_jobs(self, registry: JobRegistry) -> None:
        del registry

    def ensure_scheduled(self, session: Session) -> None:
        del session

    def prune_expired(self, session: Session) -> None:
        del session

    def on_outbox_event(self, session: Session, event: OutboxEvent, event_type: EventType) -> None:
        del session, event, event_type

    def project_notification(
        self,
        session: Session,
        event: OutboxEvent,
        event_type: EventType,
        core: CoreNotifications,
    ) -> bool:
        del session, event, event_type, core
        return False

    def engagement_targets(self) -> Mapping[EngagementTarget, TargetRule]:
        return {}

    def attachment_read_rules(self) -> Mapping[str, AttachmentReadRule]:
        return {}

    def push_preview_detail(
        self,
        session: Session,
        context: AuthorizationContext,
        target_type: EngagementTarget,
        target_id: UUID,
    ) -> tuple[str, str] | None:
        del session, context, target_type, target_id
        return None

    def on_partner_joined(self, session: Session, space_id: UUID) -> None:
        del session, space_id

    def on_membership_ended(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        del session, space_id, account_id

    def on_member_left(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        del session, space_id, account_id

    def on_account_deleted(self, session: Session, account_id: UUID) -> None:
        del session, account_id

    def hidden_wish_ids(self, session: Session, context: AuthorizationContext) -> frozenset[UUID]:
        del session, context
        return frozenset()

    def date_ideas(self) -> DateIdeaSource | None:
        return None

    def migrations(self) -> MigrationSpec | None:
        # Its own chain and version table; it runs after the Core chain and
        # references Core tables only (Decision 0017, decision 6).
        return MigrationSpec(
            script_location=str(Path(__file__).resolve().parent / "alembic"),
            version_table="alembic_version_admin",
        )

    def validate(self, settings: Settings) -> None:
        # The operator settings live under their own prefix, not in Core's.
        del settings
        load_admin_settings()

    def seed_demo(self, session: Session, result: DemoSeedResult, *, created: bool) -> None:
        del session, result, created


plugin = AdminPlugin()
