"""The contract between Core and a plugin (Decision 0017, decision 3).

The seam is internal to the eimir. product and promises no compatibility to
third parties. Core and plugin are built from the same revision, so the seam
version only has to tell two builds apart: raise ``PLUGIN_SEAM_VERSION``
whenever this Protocol, the manifest format or a hook signature changes, and
update the plugin in the same change.

Hooks that need a database receive the caller's ``Session`` and never commit,
roll back or open their own transaction. Each hook lands together with the
Core call site it replaces.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable
from uuid import UUID

if TYPE_CHECKING:
    from fastapi import APIRouter
    from sqlalchemy import ColumnElement
    from sqlalchemy.orm import Session

    from eimir.authorization import AuthorizationContext
    from eimir.config import Settings
    from eimir.demo.service import DemoSeedResult
    from eimir.domain.events import EventType
    from eimir.engagement.models import EngagementTarget, NotificationKind
    from eimir.jobs.worker import JobRegistry
    from eimir.outbox.models import OutboxEvent
    from eimir.wish_selections.date_idea_contract import DateIdeaSource

PLUGIN_SEAM_VERSION = 7
"""The seam revision Core implements. A plugin declaring another value refuses to start."""

PLUGIN_ENTRY_POINT_GROUP = "eimir.plugins"
"""The entry-point group in which a distribution registers its plugin object."""

TargetRule = Callable[["Session", "AuthorizationContext", Any, Any], "ColumnElement[bool]"]
"""Whether a notification target is current for its reader, as an SQL boolean.

Called with the reader's session and context, the target id (a value or a
column) and the notification kind (a ``NotificationKind``, a column or
``None``). Core uses the expression both for one row (``SELECT <rule>``) and
inside its notification and activity queries. Pure SQL: no I/O, no writes.
"""

AttachmentReadRule = Callable[["Session", "AuthorizationContext", UUID], bool]
"""Whether the reader may read an attachment bound to a plugin parent (read only)."""


@dataclass(frozen=True)
class MigrationSpec:
    """Where a plugin keeps its own Alembic revisions (Decision 0017, decision 6).

    The plugin chain is separate from the Core chain and records its state in
    its own ``version_table``, so a Core-only ``migrate`` never meets a plugin
    revision. Plugin revisions may reference Core tables; Core revisions never
    reference plugin tables. Core runs the chain after the Core chain reached
    its head; a directory without revisions does nothing and creates no table.
    """

    script_location: str
    """Absolute path of the plugin's Alembic script directory (with ``versions/``)."""
    version_table: str
    """The plugin's own Alembic version table, for example ``alembic_version_pro``."""


class CoreNotifications(Protocol):
    """The Core services a plugin's notification projection may use."""

    def project_target_notification(
        self,
        session: Session,
        event: OutboxEvent,
        target_type: EngagementTarget | None,
        target_id: UUID | None,
        kind: NotificationKind,
        *,
        expires_at: datetime | None = None,
    ) -> None:
        """Insert the recipient's notification, idempotent under Outbox replay."""
        ...

    def ensure_push_deliveries(self, session: Session, event: OutboxEvent) -> None:
        """Create the push deliveries for the event's notifications."""
        ...

    def ensure_email_deliveries(self, session: Session, event: OutboxEvent) -> None:
        """Create the email deliveries for the event's notifications."""
        ...


@runtime_checkable
class ProPlugin(Protocol):
    """One plugin object, registered under ``PLUGIN_ENTRY_POINT_GROUP``."""

    @property
    def name(self) -> str:
        """Equal to the entry-point name and the name in ``EIMIR_PLUGINS``."""
        ...

    @property
    def seam_version(self) -> int:
        """The ``PLUGIN_SEAM_VERSION`` the plugin was written against."""
        ...

    @property
    def core_revision(self) -> str:
        """The Core build revision the plugin was built against (``EIMIR_BUILD_REVISION``)."""
        ...

    def capabilities(self) -> frozenset[str]:
        """Return the ``Capability`` values this plugin implements. Read once at startup."""
        ...

    def model_modules(self) -> Sequence[str]:
        """Return the import paths of the plugin's ORM model modules.

        Core imports them so ``Base.metadata`` is complete. Lifecycle
        correctness never depends on this hook: the Core manifest
        (``eimir.plugins.manifest``) describes every plugin table on its own.
        """
        ...

    def routers(self) -> Sequence[APIRouter]:
        """Return the routers Core mounts under ``/api/v1`` behind normal operation."""
        ...

    def register_jobs(self, registry: JobRegistry) -> None:
        """Register the handlers of the plugin's job kinds.

        Every kind must be declared in ``manifest.PLUGIN_JOB_KINDS``. Handlers
        run in the job's ``unit_of_work`` with the existing retry semantics.
        """
        ...

    def ensure_scheduled(self, session: Session) -> None:
        """Schedule the plugin's recurring jobs; idempotent, inside the caller's transaction."""
        ...

    def prune_expired(self, session: Session) -> None:
        """Run the plugin's part of Core's security-retention job."""
        ...

    def on_outbox_event(self, session: Session, event: OutboxEvent, event_type: EventType) -> None:
        """React to every Outbox event before notification eligibility is checked.

        May only enqueue work and must stay idempotent under Outbox replay.
        """
        ...

    def project_notification(
        self,
        session: Session,
        event: OutboxEvent,
        event_type: EventType,
        core: CoreNotifications,
    ) -> bool:
        """Project the notifications of a plugin event; ``True`` when the event was handled.

        Runs after Core checked that the event may still have effects. A
        handled event gets no further Core projection, so the hook also
        creates its deliveries through ``core``.
        """
        ...

    def engagement_targets(self) -> Mapping[EngagementTarget, TargetRule]:
        """Return the currency rule of each plugin notification target.

        Every key must be declared in ``manifest.PLUGIN_ENGAGEMENT_TARGETS``.
        Without the plugin these targets are never current (fail closed).
        """
        ...

    def attachment_read_rules(self) -> Mapping[str, AttachmentReadRule]:
        """Return the read rule per plugin attachment parent type.

        Without the plugin an attachment of such a parent is not readable.
        """
        ...

    def push_preview_detail(
        self,
        session: Session,
        context: AuthorizationContext,
        target_type: EngagementTarget,
        target_id: UUID,
    ) -> tuple[str, str] | None:
        """Return the ``(title, body)`` of an encrypted v3 device preview (#2158).

        Called only for a plugin notification target that Core already found
        current for the reader. Read only. Both values are short closed
        machine codes the device localizes, never free text; ``None`` keeps
        the preview to its localized action. Without the plugin no plugin
        target is current, so Core never needs this hook then.
        """
        ...

    def on_partner_joined(self, session: Session, space_id: UUID) -> None:
        """Remove the plugin's couple-bound state when a partner joins the Space."""
        ...

    def on_membership_ended(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        """Remove the plugin's state that must not outlive the couple."""
        ...

    def on_member_left(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        """Remove what a member takes with them when they leave the Space themself."""
        ...

    def on_account_deleted(self, session: Session, account_id: UUID) -> None:
        """Remove the deleted Account's personal plugin rows.

        Account rows are pseudonymized, so their foreign-key cascades never fire.
        """
        ...

    def hidden_wish_ids(self, session: Session, context: AuthorizationContext) -> frozenset[UUID]:
        """Return the Wishes whose content the reader must not see right now (read only).

        A game in progress hides the Wishes the reader is guessing (#2158 H).
        Core masks them in its Wish read models and refuses the reader's
        writes to them. Without the plugin nothing is hidden.
        """
        ...

    def date_ideas(self) -> DateIdeaSource | None:
        """Return the curated date-idea catalog a Wish selection round may contain.

        Pure and cached. Without a source the catalog is unavailable and rounds
        with date ideas stay paused.
        """
        ...

    def migrations(self) -> MigrationSpec | None:
        """Return the plugin's own migration chain, or ``None`` while it has none.

        Run by the ``migrate`` process after Core reached its head, in the same
        deploy step. A failing plugin revision fails ``migrate`` like a failing
        Core revision.
        """
        ...

    def validate(self, settings: Settings) -> None:
        """Check the plugin's configuration before the process serves anything.

        Called once by the ``api``, ``worker`` and media processes after loading.
        Raising refuses to start with the plugin's diagnostic. The ``migrate``
        process does not load the application settings and does not call it.
        """
        ...

    def seed_demo(self, session: Session, result: DemoSeedResult, *, created: bool) -> None:
        """Add the plugin's examples to the canonical demo Space; idempotent.

        Runs inside the demo seed transaction after the demo Pro grant.
        ``created`` is true for a new or reset demo Space.
        """
        ...
