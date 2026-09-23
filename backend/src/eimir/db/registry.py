"""Import every model module so ``Base.metadata`` is complete.

Tooling that walks the metadata (the encryption lifecycle commands) needs the
whole mapping, including foreign-key targets. The application imports these
modules through its routers; a standalone process does not.
"""

from __future__ import annotations

from importlib import import_module

MODEL_MODULES = (
    "eimir.administration.models",
    "eimir.attachments.binding",
    "eimir.attachments.models",
    "eimir.auth.recent_auth_models",
    "eimir.chapters.models",
    "eimir.collections.models",
    "eimir.comments.models",
    "eimir.create_receipts.models",
    "eimir.daily_checkins.models",
    "eimir.dashboard.models",
    "eimir.demo.models",
    "eimir.engagement.models",
    "eimir.entitlements.models",
    "eimir.gift_ideas.models",
    "eimir.heart_moments.models",
    "eimir.identity.models",
    "eimir.jobs.models",
    "eimir.memories.models",
    "eimir.milestones.models",
    "eimir.outbox.models",
    "eimir.people.models",
    "eimir.places.models",
    "eimir.plans.models",
    "eimir.private_collections.models",
    "eimir.private_notes.models",
    "eimir.profiles.models",
    "eimir.quotes.models",
    "eimir.relations.models",
    "eimir.relationship.models",
    "eimir.reminders.models",
    "eimir.reminders.runtime_models",
    "eimir.story.view_models",
    "eimir.transfer.models",
    "eimir.wishes.models",
)


def load_all_models() -> None:
    for module in MODEL_MODULES:
        import_module(module)
