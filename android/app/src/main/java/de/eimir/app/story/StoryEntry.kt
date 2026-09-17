package de.eimir.app.story

import java.time.LocalDate
import java.time.YearMonth
import java.util.UUID
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.MediaType
import eimir.api.models.StoryItem

/**
 * What the Story shows for one item, independent of which contract type it
 * came from.
 *
 * The three kinds carry different fields — a Milestone has no attachments, a
 * HeartMoment has text rather than a title — so the screen would otherwise
 * branch on the contract shape in the middle of its layout.
 */
data class StoryEntry(
    val id: UUID,
    val kind: StoryEntryKind,
    val date: LocalDate,
    /** The Memory or Milestone title; a HeartMoment's own words. */
    val text: String,
    val authorName: String,
    val images: List<StoryImageRef>,
    val authorIsFormerMember: Boolean = false,
)

/**
 * Everything needed to ask for one attachment's bytes.
 *
 * An authorized read is granted against the parent the attachment hangs on,
 * not against the attachment alone, so the parent travels with it rather than
 * being looked up again at the moment of display.
 */
data class StoryImageRef(
    val attachmentId: UUID,
    val parentId: UUID,
    val parentType: AttachmentReadRequest.ParentType,
)

enum class StoryEntryKind {
    MEMORY,
    MILESTONE,
    HEART_MOMENT,
}

/**
 * A run of entries that share a date.
 *
 * The date is written once above the run rather than on every entry, which is
 * how a couple reads a shared history: by day, not by row.
 */
data class StoryDay(
    val date: LocalDate,
    val entries: List<StoryEntry>,
)

/** Only an attachment the server calls ready has bytes to read. */
private const val ATTACHMENT_READY = "READY"

fun StoryItem.toEntry(): StoryEntry = when (this) {
    is StoryItem.MemoryWrapper -> StoryEntry(
        id = value.memory.id,
        kind = StoryEntryKind.MEMORY,
        date = value.effectiveDate,
        text = value.memory.title,
        authorName = value.memory.author.displayName,
        authorIsFormerMember = value.memory.author.isFormerMember == true,
        images = value.memory.attachments
            .filter { it.mediaType == MediaType.IMAGE && it.status == ATTACHMENT_READY }
            .sortedBy { it.position }
            .map {
                StoryImageRef(
                    attachmentId = it.id,
                    parentId = value.memory.id,
                    parentType = AttachmentReadRequest.ParentType.MEMORY,
                )
            },
    )

    is StoryItem.MilestoneWrapper -> StoryEntry(
        id = value.milestone.id,
        kind = StoryEntryKind.MILESTONE,
        date = value.effectiveDate,
        text = value.milestone.title,
        authorName = value.milestone.author.displayName,
        authorIsFormerMember = value.milestone.author.isFormerMember == true,
        images = emptyList(),
    )

    is StoryItem.HeartMomentWrapper -> StoryEntry(
        id = value.heartMoment.id,
        kind = StoryEntryKind.HEART_MOMENT,
        date = value.effectiveDate,
        text = value.heartMoment.text,
        authorName = value.heartMoment.author.displayName,
        authorIsFormerMember = value.heartMoment.author.isFormerMember == true,
        images = listOfNotNull(
            value.heartMoment.attachment
                ?.takeIf { it.mediaType == MediaType.IMAGE && it.status == ATTACHMENT_READY }
                ?.let {
                    StoryImageRef(
                        attachmentId = it.id,
                        parentId = value.heartMoment.id,
                        parentType = AttachmentReadRequest.ParentType.HEART_MOMENT,
                    )
                },
        ),
    )
}

/**
 * Groups **consecutive** entries that share a date.
 *
 * Deliberately not a sort. The server decides the Story's order and hands out
 * cursors against it; re-ordering here would fight the next page and could
 * silently move an item a couple already scrolled past.
 */
fun List<StoryItem>.toStoryDays(): List<StoryDay> {
    val days = mutableListOf<StoryDay>()
    var current = mutableListOf<StoryEntry>()

    for (item in this) {
        val entry = item.toEntry()
        if (current.isNotEmpty() && current.first().date != entry.date) {
            days += StoryDay(current.first().date, current.toList())
            current = mutableListOf()
        }
        current += entry
    }
    if (current.isNotEmpty()) {
        days += StoryDay(current.first().date, current.toList())
    }
    return days
}

/**
 * One real chronological month grouping several already-grouped [StoryDay]s.
 *
 * The Product Reference calls for a real month heading in the Timeline, not
 * just day-level grouping. This sits above [toStoryDays]'s existing days
 * rather than replacing them: day headings and their entries are unchanged,
 * a month heading is simply inserted above each run of days that share a
 * year-month.
 */
data class StoryMonth(
    val month: YearMonth,
    val days: List<StoryDay>,
)

/**
 * Groups **consecutive** days that share a year-month, mirroring
 * [toStoryDays]'s "group, don't sort" contract at one coarser granularity.
 */
fun List<StoryDay>.toStoryMonths(): List<StoryMonth> {
    val months = mutableListOf<StoryMonth>()
    var current = mutableListOf<StoryDay>()

    for (day in this) {
        val month = YearMonth.from(day.date)
        if (current.isNotEmpty() && YearMonth.from(current.first().date) != month) {
            months += StoryMonth(YearMonth.from(current.first().date), current.toList())
            current = mutableListOf()
        }
        current += day
    }
    if (current.isNotEmpty()) {
        months += StoryMonth(YearMonth.from(current.first().date), current.toList())
    }
    return months
}

/**
 * Deterministic day-based featured pick for Discover, mirroring the Web
 * selection semantics (`selectFeaturedStoryItem` in `storyProduct.ts`):
 * prefer a photo-backed Memory, then a Heart Moment, then anything, so
 * Discover reads as an editorial pick rather than just "the first item".
 * Stable across recompositions for the same [date] and input list.
 */
fun List<StoryItem>.selectFeaturedStoryItem(date: LocalDate = LocalDate.now()): StoryItem? {
    if (isEmpty()) return null
    val withEntries = map { it to it.toEntry() }
    val mediaMemories = withEntries.filter { (_, entry) ->
        entry.kind == StoryEntryKind.MEMORY && entry.images.isNotEmpty()
    }
    val heartMoments = withEntries.filter { (_, entry) -> entry.kind == StoryEntryKind.HEART_MOMENT }
    val pool = when {
        mediaMemories.isNotEmpty() -> mediaMemories
        heartMoments.isNotEmpty() -> heartMoments
        else -> withEntries
    }
    if (pool.size <= 1) return pool.firstOrNull()?.first
    val sorted = pool.sortedBy { (_, entry) -> "${entry.kind}:${entry.id}" }
    val dayOrdinal = date.toEpochDay()
    val index = (((dayOrdinal % sorted.size) + sorted.size) % sorted.size).toInt()
    return sorted[index].first
}
