package de.eimir.app.story

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
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
import kotlinx.coroutines.awaitCancellation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
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
    fun printsNoKindLabelOnAMemory() = assertNoKindLabel(memory(), R.string.story_kind_memory)

    @Test
    fun printsNoKindLabelOnAMilestone() = assertNoKindLabel(milestone(), R.string.story_kind_milestone)

    @Test
    fun printsNoKindLabelOnAHeartMoment() = assertNoKindLabel(heartMoment(), R.string.story_kind_heart_moment)

    private fun assertNoKindLabel(item: StoryItem, label: Int) {
        render(listOf(item))
        composeRule
            .onAllNodesWithText(context.getString(label), useUnmergedTree = true)
            .assertCountEquals(0)
        composeRule
            .onAllNodesWithText(context.getString(R.string.relationship_visibility_shared), useUnmergedTree = true)
            .assertCountEquals(0)
    }

    @Test
    fun aMemoryIsTheDefaultEntryWithoutAKindGlyph() {
        render(listOf(memory()))

        composeRule.onNodeWithTag("story-kind-glyph-memory", useUnmergedTree = true).assertDoesNotExist()
        composeRule.onNodeWithTag("story-kind-glyph-milestone", useUnmergedTree = true).assertDoesNotExist()
        composeRule.onNodeWithTag("story-kind-glyph-heart_moment", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun aMilestoneIsNamedByItsGlyphInTheOpenableCard() =
        assertKindGlyph(milestone(), "story-kind-glyph-milestone", R.string.story_kind_milestone)

    @Test
    fun aHeartMomentIsNamedByItsGlyphInTheOpenableCard() =
        assertKindGlyph(heartMoment(), "story-kind-glyph-heart_moment", R.string.story_kind_heart_moment)

    private fun assertKindGlyph(item: StoryItem, tag: String, label: Int) {
        render(listOf(item), openable = true)

        composeRule
            .onNodeWithTag(tag, useUnmergedTree = true)
            .assertContentDescriptionEquals(context.getString(label))
        // TalkBack reads the merged card, so the kind reaches it there.
        composeRule
            .onNode(hasClickAction() and hasContentDescription(context.getString(label), substring = true))
            .assertExists()
    }

    @Test
    fun onlyAHeartMomentStatesItsSharedVisibility() {
        val shared = context.getString(R.string.story_visibility_shared)

        render(listOf(heartMoment()))
        composeRule
            .onAllNodes(hasContentDescription(shared), useUnmergedTree = true)
            .assertCountEquals(1)
    }

    @Test
    fun aMemoryDoesNotRepeatVisibilityOnEveryCard() {
        render(listOf(memory()))
        composeRule
            .onAllNodes(hasContentDescription(context.getString(R.string.story_visibility_shared)), useUnmergedTree = true)
            .assertCountEquals(0)
    }

    @Test
    fun namesThePhotoCountAsMetadata() {
        render(listOf(memory(photos = 3)))

        composeRule
            .onNode(hasContentDescription(context.resources.getQuantityString(R.plurals.story_photo_count, 3, 3)), useUnmergedTree = true)
            .assertExists()
    }

    @Test
    fun aCardWithoutPhotosStatesNoCount() {
        render(listOf(milestone()))

        composeRule
            .onAllNodes(hasContentDescription("Foto", substring = true), useUnmergedTree = true)
            .assertCountEquals(0)
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
    fun namesWhoWroteEachEntryWithoutProse() {
        render(listOf(memory()))

        composeRule.onNodeWithText("Lea", useUnmergedTree = true).assertIsDisplayed()
        composeRule
            .onAllNodesWithText(context.getString(R.string.story_by_author, "Lea"), useUnmergedTree = true)
            .assertCountEquals(0)
    }

    @Test
    @Config(qualifiers = "de-rDE-w320dp-h800dp")
    // Real text shaping: the legacy mode cannot break lines.
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    fun keepsALongAuthorAndMetadataInsideTheCardAtLargeText() {
        val longName = "Anna-Katharina-Josephine Lindqvist-Hohenberg"
        val item = memory(photos = 2, author = AuthorSummary(displayName = longName, id = UUID.randomUUID()))
        render(listOf(item), fontScale = 2f)

        val card = composeRule
            .onNodeWithTag("story-memory-${item.value.memory.id}")
            .fetchSemanticsNode()
            .boundsInRoot
        val meta = composeRule
            .onNodeWithTag("story-entry-meta-${item.value.memory.id}", useUnmergedTree = true)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue("metadata escapes the card: $meta vs $card", meta.right <= card.right && meta.left >= card.left)

        val name = composeRule.onNodeWithText(longName, useUnmergedTree = true).fetchSemanticsNode()
        val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        name.config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
        assertFalse("the author name is cut", layouts.single().hasVisualOverflow)
        assertTrue("the name did not wrap", layouts.single().lineCount > 1)
        assertTrue(name.boundsInRoot.right <= card.right)
    }

    private fun render(items: List<StoryItem>, openable: Boolean = false, fontScale: Float = 1f) {
        // Photographs never arrive: these tests read the text around them.
        val store = StoryImageStore(scope = CoroutineScope(Dispatchers.Unconfined)) {
            awaitCancellation()
        }
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                EimirTheme {
                    StoryScreen(
                        items = items,
                        imageStore = store,
                        generation = 0,
                        onOpenMemory = if (openable) ({ _ -> }) else null,
                        onOpenMilestone = if (openable) ({ _ -> }) else null,
                        onOpenHeartMoment = if (openable) ({ _ -> }) else null,
                    )
                }
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
    photos: Int = 0,
    author: AuthorSummary = AUTHOR,
) =
    StoryItem.MemoryWrapper(
        StoryMemoryItem(
            effectiveDate = date,
            kind = StoryMemoryItem.Kind.MEMORY,
            memory = MemorySummary(
                attachments = List(photos) { position ->
                    MemoryAttachmentSummary(
                        hasThumbnail = true,
                        height = 1200,
                        id = UUID.randomUUID(),
                        mediaType = MediaType.IMAGE,
                        mimeType = "image/jpeg",
                        position = position,
                        propertySize = 1024,
                        status = "READY",
                        width = 1600,
                    )
                },
                author = author,
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
