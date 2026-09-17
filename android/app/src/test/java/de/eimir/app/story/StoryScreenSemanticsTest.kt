package de.eimir.app.story

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import de.eimir.app.design.EimirTheme
import de.eimir.app.reference.R
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import eimir.api.models.AuthorSummary
import eimir.api.models.HeartEmotion
import eimir.api.models.MemorySummary
import eimir.api.models.MilestoneSummary
import eimir.api.models.ResourceCapabilities
import eimir.api.models.SharedHeartMomentSummary
import eimir.api.models.StoryHeartMomentItem
import eimir.api.models.StoryItem
import eimir.api.models.StoryMemoryItem
import eimir.api.models.StoryMilestoneItem

/**
 * What a couple actually reads off the Story.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class StoryScreenSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    // Each kind is rendered on its own: a lazy list only composes what is on
    // screen, so asserting three at once would test the window height.
    @Test
    fun namesAMemory() = assertKindIsNamed(memory(), R.string.story_kind_memory)

    @Test
    fun namesAMilestone() = assertKindIsNamed(milestone(), R.string.story_kind_milestone)

    @Test
    fun namesAHeartMoment() = assertKindIsNamed(heartMoment(), R.string.story_kind_heart_moment)

    private fun assertKindIsNamed(item: StoryItem, label: Int) {
        render(listOf(item))
        composeRule.onNodeWithText(context.getString(label)).assertIsDisplayed()
    }

    @Test
    fun writesTheDayOnceAboveTheEntriesThatShareIt() {
        val day = LocalDate.of(2026, 8, 20)
        render(listOf(memory(date = day), heartMoment(date = day)))

        val heading = day.format(
            java.time.format.DateTimeFormatter
                .ofLocalizedDate(java.time.format.FormatStyle.LONG)
                .withLocale(java.util.Locale.getDefault()),
        )
        assertEquals(1, composeRule.onAllNodesWithText(heading).fetchSemanticsNodes().size)
    }

    @Test
    fun writesARealMonthHeadingAboveTheDaysItContains() {
        val augustDay = LocalDate.of(2026, 8, 20)
        val julyDay = LocalDate.of(2026, 7, 5)
        render(listOf(memory(date = augustDay), memory(date = julyDay)))

        val august = java.time.format.DateTimeFormatter
            .ofPattern("MMMM yyyy", java.util.Locale.getDefault())
            .format(java.time.YearMonth.from(augustDay))
        val july = java.time.format.DateTimeFormatter
            .ofPattern("MMMM yyyy", java.util.Locale.getDefault())
            .format(java.time.YearMonth.from(julyDay))

        composeRule.onNodeWithText(august).assertIsDisplayed()
        composeRule.onNodeWithText(july).assertIsDisplayed()
    }

    @Test
    fun saysTheStoryIsEmptyRatherThanShowingNothing() {
        // An empty Story and a Story that failed to load must not look alike.
        render(emptyList())

        composeRule.onNodeWithText(context.getString(R.string.story_empty_title)).assertIsDisplayed()
    }

    @Test
    fun keepsALongTitleWholeInsteadOfCuttingIt() {
        val title = "The long summer evening by the lake where we decided to move in together"
        render(listOf(memory(title = title)))

        composeRule.onNodeWithText(title).assertIsDisplayed()
    }

    @Test
    fun namesWhoWroteEachEntry() {
        render(listOf(memory()))

        composeRule
            .onNodeWithText(context.getString(R.string.story_by_author, "Lea"))
            .assertIsDisplayed()
    }

    private fun render(items: List<StoryItem>) {
        val store = StoryImageStore(scope = CoroutineScope(Dispatchers.Unconfined)) {
            error("This test renders no photographs.")
        }
        composeRule.setContent {
            EimirTheme {
                StoryScreen(items = items, imageStore = store, generation = 0)
            }
        }
    }
}

private val CAPABILITIES = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true)
private val AUTHOR = AuthorSummary(displayName = "Lea", id = UUID.randomUUID())
private val CREATED: OffsetDateTime = OffsetDateTime.now()
private val DAY: LocalDate = LocalDate.of(2026, 8, 20)

private fun memory(date: LocalDate = DAY, title: String = "A day by the sea") =
    StoryItem.MemoryWrapper(
        StoryMemoryItem(
            effectiveDate = date,
            kind = StoryMemoryItem.Kind.MEMORY,
            memory = MemorySummary(
                attachments = emptyList(),
                author = AUTHOR,
                capabilities = CAPABILITIES,
                createdAt = CREATED,
                happenedOn = date,
                id = UUID.randomUUID(),
                title = title,
            ),
        ),
    )

private fun milestone(date: LocalDate = DAY) = StoryItem.MilestoneWrapper(
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

private fun heartMoment(date: LocalDate = DAY) = StoryItem.HeartMomentWrapper(
    StoryHeartMomentItem(
        effectiveDate = date,
        heartMoment = SharedHeartMomentSummary(
            attachment = null,
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
