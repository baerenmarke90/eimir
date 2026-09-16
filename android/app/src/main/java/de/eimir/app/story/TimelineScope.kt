package de.eimir.app.story

/** Applied Timeline query; text and media never enter navigation state. */
data class TimelineScope(val year: Int? = null, val kind: StoryEntryKind? = null) {
    val isDefault: Boolean get() = year == null && kind == null
}
