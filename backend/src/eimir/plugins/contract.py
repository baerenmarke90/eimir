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
from datetime import datetime
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable
from uuid import UUID

if TYPE_CHECKING:
    from fastapi import APIRouter
    from sqlalchemy import ColumnElement
    from sqlalchemy.orm import Session

    from eimir.authorization import AuthorizationContext
    from eimir.demo.service import DemoSeedResult
    from eimir.domain.events import EventType
    from eimir.engagement.models import EngagementTarget, NotificationKind
    from eimir.jobs.worker import JobRegistry
    from eimir.outbox.models import OutboxEvent
    from eimir.transfer.models import TransferScope
    from eimir.wish_selections.date_idea_contract import DateIdeaSource

PLUGIN_SEAM_VERSION = 3
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

    def export_account_document(
        self,
        session: Session,
        authorization: AuthorizationContext,
        scope: TransferScope,
    ) -> Mapping[str, Any]:
        """Return the plugin's keys of the export's account document (read only)."""
        ...

    def date_ideas(self) -> DateIdeaSource | None:
        """Return the curated date-idea catalog a Wish selection round may contain.

        Pure and cached. Without a source the catalog is unavailable and rounds
        with date ideas stay paused.
        """
        ...

    def seed_demo(self, session: Session, result: DemoSeedResult, *, created: bool) -> None:
        """Add the plugin's examples to the canonical demo Space; idempotent.

        Runs inside the demo seed transaction after the demo Pro grant.
        ``created`` is true for a new or reset demo Space.
        """
        ...
