"""The viewer-authorized timeline.

Story is a derived read model over Memory, Milestone, and HeartMoment. There
is no Story table: under M2-D11 it would become a second domain source of
truth that would need to be synchronized after every delete, privacy
transition, and retention rule, exactly where a row could otherwise survive
after it no longer exists in the domain.

The Timeline itself is viewer-authorized (#1021, superseding M2-D22): each
account's own OWNER_ONLY HeartMoments are part of their own Timeline, never
their partner's. Only the separate relationship-shared projections —
`read_shared_story_counts` for the Dashboard, and Discover in
`story.discover_service` — remain `SPACE_SHARED`-only.
"""

from __future__ import annotations

from eimir.story.service import (
    StoryKind,
    StoryOrder,
    StoryPageResult,
    StoryRow,
    read_timeline,
)

__all__ = [
    "StoryKind",
    "StoryOrder",
    "StoryPageResult",
    "StoryRow",
    "read_timeline",
]
