"""Memory authored tag contract; existing catalog keys remain valid labels."""

from eimir.core.context_tags import ContextTag as MemoryTag
from eimir.core.context_tags import ContextTags as MemoryTags
from eimir.core.context_tags import unique_tags as unique_tags

__all__ = ["MemoryTag", "MemoryTags", "unique_tags"]
