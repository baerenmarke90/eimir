package de.eimir.app.story

import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.YearMonth
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.AttachmentSummary
import eimir.api.models.AuthorSummary
import eimir.api.models.HeartEmotion
import eimir.api.models.MediaType
import eimir.api.models.MemoryAttachmentSummary
import eimir.api.models.MemorySummary
import eimir.api.models.MilestoneSummary
import eimir.api.models.ResourceCapabilities
import eimir.api.models.SharedHeartMomentSummary
import eimir.api.models.StoryHeartMomentItem
import eimir.api.models.StoryItem
import eimir.api.models.StoryMemoryItem
import eimir.api.models.StoryMilestoneItem

/**
 * The Story mixes three contract types into one stream. These tests pin what a
 * couple ends up seeing, including the cases where showing the wrong thing
 * would be worse than showing nothing.
 */
class StoryEntryTest {
    @Test
    fun readsAllThreeKindsIntoOneStream() {
        val entries = listOf(memoryItem(), milestoneItem(), heartMomentItem()).map { it.toEntry() }

        assertEquals(
            listOf(
                StoryEntryKind.MEMORY,
                StoryEntryKind.MILESTONE,
                StoryEntryKind.HEART_MOMENT,
            ),
            entries.map { it.kind },
        )
        assertEquals(
            listOf("A day by the sea", "Moved in together", "Thank you for today"),
            entries.map { it.text },
        )
    }

    @Test
    fun preservesFormerMemberStateForLocalizedPresentation() {
        val former = AuthorSummary(
            displayName = "",
            id = UUID.randomUUID(),
            isFormerMember = true,
        )

        val entry = memoryItem(author = former).toEntry()

        assertTrue(entry.authorIsFormerMember)
        assertEquals("", entry.authorName)
    }

    @Test
    fun groupsConsecutiveEntriesUnderTheirDay() {
        val first = LocalDate.of(2026, 8, 20)
        val second = LocalDate.of(2026, 8, 18)

        val days = listOf(
            memoryItem(date = first),
            heartMomentItem(date = first),
            memoryItem(date = second),
        ).toStoryDays()

        assertEquals(listOf(first, second), days.map { it.date })
        assertEquals(listOf(2, 1), days.map { it.entries.size })
    }

    @Test
    fun doesNotReorderWhatTheServerOrdered() {
        // The server owns the Story's order and hands out cursors against it.
        // Sorting here would fight the next page, and a date that recurs later
        // in the stream is the server's business, not a defect to repair.
        val early = LocalDate.of(2026, 1, 1)
        val late = LocalDate.of(2026, 9, 9)

        val days = listOf(
            memoryItem(date = late),
            memoryItem(date = early),
            memoryItem(date = late),
        ).toStoryDays()

        assertEquals(listOf(late, early, late), days.map { it.date })
    }

    @Test
    fun showsOnlyAttachmentsThatAreReadyImages() {
        // A pending upload has no bytes to read, and a video is out of scope
        // while the server rejects it. Either would render as a broken tile.
        val item = memoryItem(
            attachments = listOf(
                attachment(position = 0, status = "READY"),
                attachment(position = 1, status = "VALIDATING"),
                attachment(position = 2, status = "READY", mediaType = MediaType.VIDEO),
            ),
        )

        assertEquals(1, item.toEntry().images.size)
    }

    @Test
    fun ordersImagesTheWayTheMemoryDoes() {
        val third = attachment(position = 2, status = "READY")
        val first = attachment(position = 0, status = "READY")
        val second = attachment(position = 1, status = "READY")
        val item = memoryItem(attachments = listOf(third, first, second))

        assertEquals(
            listOf(first.id, second.id, third.id),
            item.toEntry().images.map { it.attachmentId },
        )
    }

    @Test
    fun carriesTheParentEachAuthorizedReadNeeds() {
        // A read is granted against the parent, not the attachment alone, so
        // the wrong parent means a refused read rather than a wrong image.
        val memory = memoryItem(attachments = listOf(attachment(0, "READY"))).toEntry()
        assertEquals(AttachmentReadRequest.ParentType.MEMORY, memory.images.single().parentType)
        assertEquals(memory.id, memory.images.single().parentId)

        val heart = heartMomentItem(withImage = true).toEntry()
        assertEquals(AttachmentReadRequest.ParentType.HEART_MOMENT, heart.images.single().parentType)
        assertEquals(heart.id, heart.images.single().parentId)
    }

    @Test
    fun anEmptyStoryHasNoDays() {
        assertTrue(emptyList<StoryItem>().toStoryDays().isEmpty())
    }

    @Test
    fun groupsConsecutiveDaysUnderARealMonthHeading() {
        val augustLate = LocalDate.of(2026, 8, 26)
        val augustEarly = LocalDate.of(2026, 8, 1)
        val july = LocalDate.of(2026, 7, 5)

        val months = listOf(
            memoryItem(date = augustLate),
            memoryItem(date = augustEarly),
            memoryItem(date = july),
        ).toStoryDays().toStoryMonths()

        assertEquals(
            listOf(YearMonth.of(2026, 8), YearMonth.of(2026, 7)),
            months.map { it.month },
        )
        // The existing per-day grouping is preserved underneath the month, not
        // flattened or replaced by it.
        assertEquals(listOf(2, 1), months.map { it.days.size })
    }

    @Test
    fun doesNotReorderMonthsEitherWhenTheServerOrderRepeatsAYear() {
        val decemberLastYear = LocalDate.of(2025, 12, 1)
        val januaryThisYear = LocalDate.of(2026, 1, 1)

        val months = listOf(
            memoryItem(date = januaryThisYear),
            memoryItem(date = decemberLastYear),
            memoryItem(date = januaryThisYear),
        ).toStoryDays().toStoryMonths()

        assertEquals(
            listOf(YearMonth.of(2026, 1), YearMonth.of(2025, 12), YearMonth.of(2026, 1)),
            months.map { it.month },
        )
    }

    @Test
    fun anEmptyStoryHasNoMonths() {
        assertTrue(emptyList<StoryItem>().toStoryDays().toStoryMonths().isEmpty())
    }

    @Test
    fun featuredPickHasNoItemsReturnsNull() {
        assertEquals(null, emptyList<StoryItem>().selectFeaturedStoryItem())
    }

    @Test
    fun featuredPickPrefersAPhotoBackedMemoryOverAHeartMomentOrMilestone() {
        val textOnlyMemory = memoryItem()
        val heart = heartMomentItem(withImage = true)
        val milestone = milestoneItem()
        val photoMemory = memoryItem(attachments = listOf(attachment(0, "READY")))

        val featured = listOf(textOnlyMemory, heart, milestone, photoMemory).selectFeaturedStoryItem()

        assertEquals(StoryEntryKind.MEMORY, featured?.toEntry()?.kind)
        assertTrue(featured?.toEntry()?.images?.isNotEmpty() == true)
    }

    @Test
    fun featuredPickFallsBackToAHeartMomentWhenNoMemoryHasAReadyImage() {
        val textOnlyMemory = memoryItem()
        val heart = heartMomentItem(withImage = true)
        val milestone = milestoneItem()

        val featured = listOf(textOnlyMemory, heart, milestone).selectFeaturedStoryItem()

        assertEquals(StoryEntryKind.HEART_MOMENT, featured?.toEntry()?.kind)
    }

    @Test
    fun featuredPickFallsBackToAnythingWhenOnlyMilestonesExist() {
        val featured = listOf(milestoneItem(), milestoneItem()).selectFeaturedStoryItem()

        assertEquals(StoryEntryKind.MILESTONE, featured?.toEntry()?.kind)
    }

    @Test
    fun featuredPickIsStableForTheSameDayAndChangesOnlyWithTheDate() {
        val pool = listOf(
            memoryItem(attachments = listOf(attachment(0, "READY"))),
            memoryItem(attachments = listOf(attachment(0, "READY"))),
            memoryItem(attachments = listOf(attachment(0, "READY"))),
        )
        val today = LocalDate.of(2026, 9, 16)

        val first = pool.selectFeaturedStoryItem(today)
        val second = pool.selectFeaturedStoryItem(today)
        assertEquals(first?.toEntry()?.id, second?.toEntry()?.id)

        // Different single-item pools may or may not coincide by chance, but a
        // sufficiently different date over a 3-item pool must be able to
        // select a different index at least once across the cycle.
        val laterDates = (1..3).map { today.plusDays(it.toLong()) }
        val laterPicks = laterDates.map { pool.selectFeaturedStoryItem(it)?.toEntry()?.id }
        assertTrue(laterPicks.toSet().size > 1)
    }
}

private val CAPABILITIES = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true)
private val AUTHOR = AuthorSummary(displayName = "Lea", id = UUID.randomUUID())
private val CREATED: OffsetDateTime = OffsetDateTime.now()
private val DEFAULT_DATE: LocalDate = LocalDate.of(2026, 8, 20)

private fun attachment(
    position: Int,
    status: String,
    mediaType: MediaType = MediaType.IMAGE,
) = MemoryAttachmentSummary(
    hasThumbnail = true,
    height = 1200,
    id = UUID.randomUUID(),
    mediaType = mediaType,
    mimeType = "image/jpeg",
    position = position,
    propertySize = 1024,
    status = status,
    width = 1600,
)

private fun memoryItem(
    date: LocalDate = DEFAULT_DATE,
    attachments: List<MemoryAttachmentSummary> = emptyList(),
    author: AuthorSummary = AUTHOR,
) = StoryItem.MemoryWrapper(
    StoryMemoryItem(
        effectiveDate = date,
        kind = StoryMemoryItem.Kind.MEMORY,
        memory = MemorySummary(
            attachments = attachments,
            author = author,
            capabilities = CAPABILITIES,
            createdAt = CREATED,
            happenedOn = date,
            id = UUID.randomUUID(),
            title = "A day by the sea",
        ),
    ),
)

private fun milestoneItem(date: LocalDate = DEFAULT_DATE) = StoryItem.MilestoneWrapper(
    StoryMilestoneItem(
        effectiveDate = date,
        kind = StoryMilestoneItem.Kind.MILESTONE,
        milestone = MilestoneSummary(
            author = AUTHOR,
            capabilities = CAPABILITIES,
            createdAt = CREATED,
            happenedOn = date,
            id = UUID.randomUUID(),
            title = "Moved in together",
        ),
    ),
)

private fun heartMomentItem(
    date: LocalDate = DEFAULT_DATE,
    withImage: Boolean = false,
) = StoryItem.HeartMomentWrapper(
    StoryHeartMomentItem(
        effectiveDate = date,
        heartMoment = SharedHeartMomentSummary(
            attachment = if (withImage) {
                AttachmentSummary(
                    hasThumbnail = true,
                    height = 800,
                    id = UUID.randomUUID(),
                    mediaType = MediaType.IMAGE,
                    mimeType = "image/jpeg",
                    propertySize = 512,
                    status = "READY",
                    width = 800,
                )
            } else {
                null
            },
            author = AUTHOR,
            capabilities = CAPABILITIES,
            createdAt = CREATED,
            emotion = HeartEmotion.LOVED,
            happenedOn = date,
            id = UUID.randomUUID(),
            text = "Thank you for today",
        ),
        kind = StoryHeartMomentItem.Kind.HEART_MOMENT,
    ),
)
