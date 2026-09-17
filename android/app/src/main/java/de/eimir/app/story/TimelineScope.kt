package de.eimir.app.story

/** Chronological direction of a Timeline read, mirroring the backend's default-DESC contract. */
enum class StoryOrder {
    NEWEST_FIRST,
    OLDEST_FIRST,
}

/**
 * Momente's two peer browsing modes. Discover is always the unfiltered
 * chronology independent of whatever [TimelineScope] Timeline currently has
 * applied; switching modes never mutates the other mode's own state.
 */
enum class StoryView {
    DISCOVER,
    TIMELINE,
}

/** Applied Timeline query; text and media never enter navigation state. */
data class TimelineScope(
    val year: Int? = null,
    val kind: StoryEntryKind? = null,
    val order: StoryOrder = StoryOrder.NEWEST_FIRST,
) {
    val isDefault: Boolean get() = year == null && kind == null && order == StoryOrder.NEWEST_FIRST
}
