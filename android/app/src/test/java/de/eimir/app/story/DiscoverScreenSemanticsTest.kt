package de.eimir.app.story

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.core.app.ApplicationProvider
import de.eimir.app.design.EimirTheme
import de.eimir.app.reference.R
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import eimir.api.models.AuthorSummary
import eimir.api.models.MediaType
import eimir.api.models.MemoryAttachmentSummary
import eimir.api.models.MemorySummary
import eimir.api.models.MilestoneSummary
import eimir.api.models.ResourceCapabilities
import eimir.api.models.StoryItem
import eimir.api.models.StoryMemoryItem
import eimir.api.models.StoryMilestoneItem

/**
 * Discover as a distinct product composition (#966 PO review), not a second
 * unfiltered Timeline: one featured item never duplicated in the bounded
 * list below it, early year entrances, and an explicit continuation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DiscoverScreenSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun showsTheSoleItemAsFeaturedRatherThanTheGenericEmptyState() {
        render(items = listOf(memory(title = "Our first trip", withImage = true)))

        // Not the "first-use empty" panel — a real item exists and is shown.
        composeRule.onNodeWithText(context.getString(R.string.story_empty_title))
            .assertDoesNotExist()
        composeRule.onNodeWithText("Our first trip").assertIsDisplayed()
        composeRule.onNodeWithTag("discover-featured").assertIsDisplayed()
    }

    @Test
    fun neverShowsTheFeaturedItemTwice() {
        val featuredCandidate = memory(title = "Late August Vacation", withImage = true)
        render(
            items = listOf(
                featuredCandidate,
                memory(title = "Spring Picnic", date = LocalDate.of(2026, 7, 5)),
                milestone(title = "Moved in together", date = LocalDate.of(2026, 8, 1)),
            ),
        )

        // The featured pick's own title appears exactly once, not once in the
        // featured slot and again in the bounded month-grouped list below.
        assertEquals(
            1,
            composeRule.onAllNodesWithText("Late August Vacation").fetchSemanticsNodes().size,
        )
        // The rest of the pool is still there, further down the same scroll —
        // scrolled to explicitly since a LazyColumn only composes what is
        // near the viewport.
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Spring Picnic"))
        composeRule.onNodeWithText("Spring Picnic").assertIsDisplayed()
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Moved in together"))
        composeRule.onNodeWithText("Moved in together").assertIsDisplayed()
    }

    @Test
    fun rendersEarlyYearEntrancesThatSelectThatYear() {
        var selected: Int? = null
        render(
            items = listOf(memory()),
            availableYears = listOf(2026, 2025, 2021),
            onSelectYear = { selected = it },
        )

        composeRule.onNodeWithText(context.getString(R.string.momente_discover_years_heading))
            .assertIsDisplayed()
        composeRule.onNodeWithTag("discover-year-2025").assertIsDisplayed().performClick()
        assertEquals(2025, selected)
    }

    @Test
    fun omitsTheYearSectionWhenNoYearsAreAvailable() {
        render(items = listOf(memory()), availableYears = emptyList())

        composeRule.onNodeWithText(context.getString(R.string.momente_discover_years_heading))
            .assertDoesNotExist()
    }

    @Test
    fun offersAnExplicitContinuationIntoTimeline() {
        var continued = false
        render(items = listOf(memory()), onContinueToTimeline = { continued = true })

        composeRule.onNodeWithTag("momente-discover-continue").performClick()
        assertTrue(continued)
    }

    @Test
    fun aMilestoneOnlyPoolStillProducesAFeaturedItemWithoutCrashing() {
        render(items = listOf(milestone(title = "Two years together")))

        composeRule.onNodeWithText("Two years together").assertIsDisplayed()
        composeRule.onNodeWithTag("discover-featured").assertIsDisplayed()
    }

    @Test
    fun saysDiscoverIsEmptyOnlyWhenThereIsGenuinelyNothing() {
        render(items = emptyList())

        composeRule.onNodeWithText(context.getString(R.string.story_empty_title)).assertIsDisplayed()
        composeRule.onNodeWithTag("discover-featured").assertDoesNotExist()
    }

    private fun render(
        items: List<StoryItem>,
        availableYears: List<Int> = emptyList(),
        onSelectYear: (Int) -> Unit = {},
        onContinueToTimeline: () -> Unit = {},
    ) {
        val store = StoryImageStore(scope = CoroutineScope(Dispatchers.Unconfined)) {
            error("This test renders no photographs.")
        }
        composeRule.setContent {
            EimirTheme {
                DiscoverScreen(
                    items = items,
                    availableYears = availableYears,
                    imageStore = store,
                    generation = 0,
                    onSelectYear = onSelectYear,
                    onContinueToTimeline = onContinueToTimeline,
                )
            }
        }
    }
}

private val CAPABILITIES = ResourceCapabilities(canComment = true, canDelete = true, canEdit = true)
private val AUTHOR = AuthorSummary(displayName = "Lea", id = UUID.randomUUID())
private val CREATED: OffsetDateTime = OffsetDateTime.now()
private val DAY: LocalDate = LocalDate.of(2026, 8, 20)

private fun memory(
    date: LocalDate = DAY,
    title: String = "A day by the sea",
    withImage: Boolean = false,
) = StoryItem.MemoryWrapper(
    StoryMemoryItem(
        effectiveDate = date,
        kind = StoryMemoryItem.Kind.MEMORY,
        memory = MemorySummary(
            attachments = if (withImage) {
                listOf(
                    MemoryAttachmentSummary(
                        hasThumbnail = true,
                        height = 1200,
                        id = UUID.randomUUID(),
                        mediaType = MediaType.IMAGE,
                        mimeType = "image/jpeg",
                        position = 0,
                        propertySize = 1024,
                        status = "READY",
                        width = 1600,
                    ),
                )
            } else {
                emptyList()
            },
            author = AUTHOR,
            capabilities = CAPABILITIES,
            createdAt = CREATED,
            happenedOn = date,
            id = UUID.randomUUID(),
            title = title,
        ),
    ),
)

private fun milestone(date: LocalDate = DAY, title: String = "Moved in together") =
    StoryItem.MilestoneWrapper(
        StoryMilestoneItem(
            effectiveDate = date,
            kind = StoryMilestoneItem.Kind.MILESTONE,
            milestone = MilestoneSummary(
                author = AUTHOR,
                capabilities = CAPABILITIES,
                createdAt = CREATED,
                happenedOn = date,
                id = UUID.randomUUID(),
                title = title,
            ),
        ),
    )

