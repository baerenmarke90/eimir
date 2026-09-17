package de.eimir.app.story

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.core.app.ApplicationProvider
import de.eimir.app.design.EimirTheme
import de.eimir.app.reference.R
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TimelineScopeControlsSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun appliedOldestFirstOrderRemainsVisibleOutsideTheFilterSheet() {
        render(
            TimelineScope(
                year = 2025,
                kind = StoryEntryKind.MEMORY,
                order = StoryOrder.OLDEST_FIRST,
            ),
        )

        composeRule.onNodeWithTag("timeline-applied-scope")
            .assertIsDisplayed()
            .assertTextEquals(
                context.getString(
                    R.string.timeline_filter_scope,
                    "2025",
                    context.getString(R.string.story_kind_memory),
                ),
            )
        composeRule.onNodeWithTag("timeline-applied-order")
            .assertIsDisplayed()
            .assertTextEquals(context.getString(R.string.timeline_filter_order_oldest))
    }

    @Test
    fun defaultNewestFirstOrderDoesNotAddRedundantScopeNoise() {
        render(TimelineScope())

        composeRule.onNodeWithTag("timeline-applied-scope").assertIsDisplayed()
        assertEquals(
            0,
            composeRule.onAllNodesWithTag("timeline-applied-order").fetchSemanticsNodes().size,
        )
    }

    private fun render(scope: TimelineScope) {
        composeRule.setContent {
            EimirTheme {
                TimelineScopeControls(
                    scope = scope,
                    availableYears = listOf(2026, 2025),
                    onApply = {},
                )
            }
        }
    }
}
