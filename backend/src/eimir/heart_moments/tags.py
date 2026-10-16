"""HeartMoment authored tags retain their parent's privacy and legacy keys."""

from eimir.core.context_tags import ContextTag as HeartMomentTag
from eimir.core.context_tags import ContextTags as HeartMomentTags
from eimir.core.context_tags import unique_tags as unique_tags

__all__ = ["HeartMomentTag", "HeartMomentTags", "unique_tags"]
