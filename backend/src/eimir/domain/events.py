"""Domain events.

The domain knows neither push delivery nor mail nor any integration. It
records that something happened; a worker decides what follows.

Event payloads deliberately contain NO sensitive content. An event carries
references - who, where, which object - rather than the text of a memory. Two
reasons: payloads persist in the outbox and in logs, and after the transition
to end-to-end encryption the server would not have that text anyway.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from eimir.authorization import ContentVisibility


class EventType(StrEnum):
    """Event catalog. A shipped name is never renamed."""

    MEMORY_CREATED = "MEMORY_CREATED"
    MEMORY_UPDATED = "MEMORY_UPDATED"
    MEMORY_DELETED = "MEMORY_DELETED"
    HEART_MOMENT_CREATED = "HEART_MOMENT_CREATED"
    HEART_MOMENT_UPDATED = "HEART_MOMENT_UPDATED"
    HEART_MOMENT_DELETED = "HEART_MOMENT_DELETED"
    HEART_MOMENT_VISIBILITY_CHANGED = "HEART_MOMENT_VISIBILITY_CHANGED"
    MILESTONE_CREATED = "MILESTONE_CREATED"
    MILESTONE_UPDATED = "MILESTONE_UPDATED"
    MILESTONE_DELETED = "MILESTONE_DELETED"
    COMMENT_CREATED = "COMMENT_CREATED"
    WISH_CREATED = "WISH_CREATED"
    WISH_UPDATED = "WISH_UPDATED"
    WISH_DELETED = "WISH_DELETED"
    # The three Wish status edges from M3-D02/D03/D04. Separate types instead
    # of `WISH_UPDATED`: for a consumer, "planned" is a different event from
    # "renamed".
    WISH_PLANNED = "WISH_PLANNED"
    WISH_REOPENED = "WISH_REOPENED"
    PLACE_CREATED = "PLACE_CREATED"
    PLACE_UPDATED = "PLACE_UPDATED"
    PLACE_DELETED = "PLACE_DELETED"
    # Typed content relations from M3-D08. Separate types instead of parent
    # update events: linking establishes a relation but does not mutate the
    # parent content itself.
    PLACE_MEMORY_LINKED = "PLACE_MEMORY_LINKED"
    PLACE_MEMORY_UNLINKED = "PLACE_MEMORY_UNLINKED"
    PLACE_HEART_MOMENT_LINKED = "PLACE_HEART_MOMENT_LINKED"
    PLACE_HEART_MOMENT_UNLINKED = "PLACE_HEART_MOMENT_UNLINKED"
    PLACE_MILESTONE_LINKED = "PLACE_MILESTONE_LINKED"
    PLACE_MILESTONE_UNLINKED = "PLACE_MILESTONE_UNLINKED"
    CHAPTER_CREATED = "CHAPTER_CREATED"
    CHAPTER_UPDATED = "CHAPTER_UPDATED"
    CHAPTER_DELETED = "CHAPTER_DELETED"
    CHAPTER_MEMORY_LINKED = "CHAPTER_MEMORY_LINKED"
    CHAPTER_MEMORY_UNLINKED = "CHAPTER_MEMORY_UNLINKED"
    CHAPTER_HEART_MOMENT_LINKED = "CHAPTER_HEART_MOMENT_LINKED"
    CHAPTER_HEART_MOMENT_UNLINKED = "CHAPTER_HEART_MOMENT_UNLINKED"
    CHAPTER_MILESTONE_LINKED = "CHAPTER_MILESTONE_LINKED"
    CHAPTER_MILESTONE_UNLINKED = "CHAPTER_MILESTONE_UNLINKED"
    COLLECTION_CREATED = "COLLECTION_CREATED"
    COLLECTION_UPDATED = "COLLECTION_UPDATED"
    COLLECTION_DELETED = "COLLECTION_DELETED"
    COLLECTION_ITEM_CREATED = "COLLECTION_ITEM_CREATED"
    COLLECTION_ITEM_UPDATED = "COLLECTION_ITEM_UPDATED"
    COLLECTION_ITEM_DELETED = "COLLECTION_ITEM_DELETED"
    COLLECTION_REORDERED = "COLLECTION_REORDERED"
    PRIVATE_NOTE_CREATED = "PRIVATE_NOTE_CREATED"
    PRIVATE_NOTE_UPDATED = "PRIVATE_NOTE_UPDATED"
    PRIVATE_NOTE_DELETED = "PRIVATE_NOTE_DELETED"
    GIFT_IDEA_CREATED = "GIFT_IDEA_CREATED"
    GIFT_IDEA_UPDATED = "GIFT_IDEA_UPDATED"
    GIFT_IDEA_DELETED = "GIFT_IDEA_DELETED"
    PRIVATE_COLLECTION_CREATED = "PRIVATE_COLLECTION_CREATED"
    PRIVATE_COLLECTION_UPDATED = "PRIVATE_COLLECTION_UPDATED"
    PRIVATE_COLLECTION_DELETED = "PRIVATE_COLLECTION_DELETED"
    PRIVATE_COLLECTION_ITEM_CREATED = "PRIVATE_COLLECTION_ITEM_CREATED"
    PRIVATE_COLLECTION_ITEM_UPDATED = "PRIVATE_COLLECTION_ITEM_UPDATED"
    PRIVATE_COLLECTION_ITEM_DELETED = "PRIVATE_COLLECTION_ITEM_DELETED"
    PRIVATE_COLLECTION_REORDERED = "PRIVATE_COLLECTION_REORDERED"
    PLAN_CREATED = "PLAN_CREATED"
    PLAN_UPDATED = "PLAN_UPDATED"
    PLAN_DELETED = "PLAN_DELETED"
    PLAN_COMPLETED = "PLAN_COMPLETED"
    WISH_COMPLETED = "WISH_COMPLETED"
    IMPORTANT_DATE_APPROACHING = "IMPORTANT_DATE_APPROACHING"
    PARTNER_THINKING_OF_YOU = "PARTNER_THINKING_OF_YOU"
    PARTNER_KISS = "PARTNER_KISS"
    PARTNER_CHECK_IN = "PARTNER_CHECK_IN"
    REMINDER_DUE = "REMINDER_DUE"
    PROFILE_PREFERENCE_CHANGED = "PROFILE_PREFERENCE_CHANGED"
    PARTNER_JOINED = "PARTNER_JOINED"


class PublicEventPayload(BaseModel):
    """Explicit allowlist for persistently stored event metadata.

    "Public" means only that the data is safe to transport outside a
    ProtectedPayload. It is not a public API or permission to disclose the
    data to third parties. New fields require deliberate review at this
    central boundary; arbitrary dictionaries and plaintext content are
    excluded.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    has_attachment: bool | None = None
    visibility: ContentVisibility | None = None

    target_type: Literal["MEMORY", "HEART_MOMENT", "MILESTONE"] | None = None
    target_id: UUID | None = None
    recipient_id: UUID | None = None
    occurrence_id: UUID | None = None
    due_at: datetime | None = None
    rule_key: str | None = Field(default=None, max_length=96)
    """Safe references and technical scheduling metadata for later consumers.

    IDs, closed target categories, due instants and stable machine rule keys
    only. User-controlled content must never appear here.
    """


class DomainEvent(BaseModel):
    """A domain event.

    `payload` is limited to references and non-sensitive attributes. A
    consumer that needs content loads it from the domain while processing,
    which reapplies visibility rules instead of carrying a copy around them.

    For M2 the outbox row together with this object forms the minimal envelope
    defined in #68: Outbox ID = eventId, createdAt = occurredAt,
    subject_type/-id = resourceType/-Id, and `resource_version` =
    resourceVersion. Older non-M2 events may continue to omit the version.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: EventType
    space_id: UUID
    actor_id: UUID | None = None
    subject_type: str
    subject_id: UUID
    resource_version: int | None = Field(default=None, ge=1)
    payload: PublicEventPayload = Field(default_factory=PublicEventPayload)
