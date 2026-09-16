package de.eimir.app.reference

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import de.eimir.app.design.EimirTheme
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The production shell, navigation, composer and canonical detail with only transport substituted. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class TaskJourneyTest {
    @get:Rule val compose = createComposeRule()
    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val store = ViewModelStore()
    private lateinit var model: ReferenceViewModel
    private lateinit var api: TaskJourneyFixture
    @After fun tearDown() = store.clear()

    @Test fun quickCreateOpensTaskThenActualConfirmedDetailAndReturnsToOrigin() {
        render()
        openComposer()
        compose.onNodeWithTag("quick-create-trigger").assertDoesNotExist()
        enterWords()
        save()
        compose.waitUntil(5_000) { model.uiState.value.openMemory?.title == "A real result" }
        compose.onNodeWithText("Full words from this draft").assertIsDisplayed()
        assertEquals(1, api.createCalls)
        compose.onNodeWithTag("memory-detail-back").performClick()
        compose.onNodeWithTag("quick-create-trigger").assertIsDisplayed()
        compose.onNodeWithTag("memory-detail").assertDoesNotExist()
        assertNull(model.uiState.value.memoryTask)
    }

    @Test fun dirtyCloseKeepsWorkUntilDeliberateDiscard() {
        render(); openComposer(); enterWords()
        closeComposer()
        compose.onNodeWithText(text(R.string.memory_task_keep)).performClick()
        compose.onNodeWithTag("memory-create-body").assertTextContains("Full words from this draft")
        closeComposer()
        compose.onNodeWithText(text(R.string.memory_task_discard)).performClick()
        compose.onNodeWithTag("memory-create-scroll").assertDoesNotExist()
        assertNull(model.uiState.value.memoryTask)
        assertEquals(0, api.createCalls)
    }

    @Test fun pendingCloseExplainsAndCannotLoseConfirmedResult() {
        render("pending")
        api.pendingGate = CompletableDeferred()
        openComposer(); enterWords(); save()
        closeComposer()
        compose.onNodeWithText(text(R.string.memory_task_wait)).performClick()
        assertEquals(MemoryTaskPhase.SUBMITTING, model.uiState.value.memoryTask?.phase)
        compose.runOnIdle { api.pendingGate!!.complete(Unit) }
        compose.waitUntil(5_000) { model.uiState.value.memoryTask == null }
        compose.onNodeWithTag("memory-detail").assertExists()
        assertEquals(1, api.createCalls)
    }

    @Test fun uncertainCreateRetainsWordsAndOffersNoSecondSave() {
        render("uncertain"); openComposer(); enterWords(); save()
        compose.waitUntil(5_000) { model.uiState.value.memoryTask?.phase == MemoryTaskPhase.UNCERTAIN }
        compose.onNodeWithTag("memory-create-save").assertDoesNotExist()
        compose.onNodeWithTag("memory-create-body").assertTextContains("Full words from this draft").assertIsNotEnabled()
        assertEquals(1, api.createCalls)
    }

    @Test fun filterCancelKeepsScopeAndAppliedOlderPagesReturnAtSamePosition() {
        render()
        compose.onNodeWithText(text(R.string.destination_story)).performClick()
        compose.onNodeWithTag("timeline-filter").performClick()
        compose.onNodeWithTag("timeline-year").performClick()
        compose.onNodeWithText("2025").performClick()
        compose.onNodeWithTag("task-sheet-close").performClick()
        assertTrue(model.uiState.value.storyScope.isDefault)
        compose.onNodeWithTag("timeline-filter").assertIsFocused().performClick()
        compose.onNodeWithTag("timeline-year").performClick()
        compose.onNodeWithText("2025").performClick()
        compose.onNodeWithTag("timeline-apply").performClick()
        compose.waitUntil(5_000) { model.uiState.value.storyScope.year == 2025 && !model.uiState.value.storyLoading }
        compose.onNodeWithTag("timeline-scroll").performScrollToNode(hasText(text(R.string.load_more)))
        compose.onNodeWithText(text(R.string.load_more)).performClick()
        compose.waitUntil(5_000) { model.uiState.value.storyItems.size == 10 }
        val older = "story-memory-${UUID(958, 9)}"
        compose.onNodeWithTag("timeline-scroll").performScrollToNode(hasTestTag(older))
        val oldPosition = compose.onNodeWithTag(older).fetchSemanticsNode().positionInRoot
        compose.onNodeWithTag(older).performClick()
        compose.onNodeWithTag("memory-detail-back").performClick()
        compose.onNodeWithTag(older).assertIsDisplayed()
        assertEquals(oldPosition, compose.onNodeWithTag(older).fetchSemanticsNode().positionInRoot)
        assertEquals(2025, model.uiState.value.storyScope.year)
        assertEquals(10, model.uiState.value.storyItems.size)
    }

    private fun render(scenario: String = "ready") {
        api = TaskJourneyFixture(context, scenario)
        model = ReferenceViewModel(ReferenceConfig("https://fixture.invalid"), api = api)
        store.put("reference", model)
        compose.setContent { EimirTheme { ReferenceFlowRoute(referenceViewModel = model) } }
        compose.runOnIdle { model.signIn("fixture@example.test", "fixture") }
        compose.waitUntil(5_000) { model.uiState.value.loggedIn }
        compose.waitForIdle()
    }

    private fun openComposer() {
        compose.onNodeWithTag("quick-create-trigger").performClick()
        compose.onNodeWithText(text(R.string.quick_create_memory)).performClick()
        compose.onNodeWithTag("memory-create-title").assertExists()
    }
    private fun enterWords() {
        compose.onNodeWithTag("memory-create-title").performTextInput("A real result")
        compose.onNodeWithTag("memory-create-body").performTextInput("Full words from this draft")
    }
    private fun save() {
        compose.onNodeWithTag("memory-create-scroll").performScrollToNode(hasTestTag("memory-create-save"))
        compose.onNodeWithTag("memory-create-save").performClick()
    }
    private fun closeComposer() {
        compose.onNodeWithTag("memory-create-scroll").performScrollToNode(hasTestTag("memory-create-close"))
        compose.onNodeWithTag("memory-create-close").performClick()
    }
    private fun text(resource: Int) = context.getString(resource)
}
