package de.eimir.app.design

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.core.app.ApplicationProvider
import de.eimir.app.reference.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h1000dp")
class VisualRolesProofTest {
    @get:Rule val compose = createComposeRule()
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun photoOpensReadingAndReturnsToTheSameComposition() {
        render()
        awaitPhoto()
        compose.onNodeWithTag("proof-photo-open").performClick()
        compose.onNodeWithText(context.getString(R.string.proof_photo_body)).assertIsDisplayed()
        compose.onNodeWithTag("proof-back").performClick()
        compose.onNodeWithTag("proof-text-open").assertIsDisplayed()
    }

    @Test
    fun failedMediaRetainsTheCaptionAndRetryShowsTheActualLocalPhoto() {
        render("error")
        compose.onNodeWithTag("proof-error").assertIsDisplayed()
        compose.onNodeWithText(context.getString(R.string.proof_photo_title)).assertIsDisplayed()
        compose.onNodeWithTag("proof-photo-open").performClick()
        compose.onNodeWithTag("proof-error").assertIsDisplayed()
        compose.onNodeWithTag("proof-retry").performClick()
        awaitPhoto()
        compose.onNodeWithTag("proof-error").assertDoesNotExist()
    }

    @Test
    fun loadingIsDistinctFromAnAbsentImageAndFromAnError() {
        render("loading")
        compose.onNodeWithTag("proof-loading").assertIsDisplayed()
        compose.onNodeWithTag("proof-error").assertDoesNotExist()
        compose.onNodeWithTag("proof-retry").assertDoesNotExist()
    }

    @Test
    fun textOnlyContentHasNoPhotoPlaceholderAndRemainsReadable() {
        render("empty")
        compose.onNodeWithTag("proof-loading").assertDoesNotExist()
        compose.onNodeWithTag("proof-photo").assertDoesNotExist()
        compose.onNodeWithText(context.getString(R.string.proof_empty_title)).assertIsDisplayed()
        compose.onNodeWithTag("proof-photo-open").performClick()
        compose.onNodeWithTag("proof-photo").assertDoesNotExist()
        compose.onNodeWithTag("proof-loading").assertDoesNotExist()
        compose.onNodeWithText(context.getString(R.string.proof_photo_body)).assertIsDisplayed()
        compose.onNodeWithTag("proof-back").performClick()
        compose.onNodeWithTag("proof-text-open").performScrollTo().performClick()
        compose.onNodeWithText(context.getString(R.string.proof_text_body)).assertIsDisplayed()
    }

    @Test
    fun utilityOpensARealSheetAndCloseReturnsToItsTrigger() {
        render()
        compose.onNodeWithTag("proof-overlay-open").performScrollTo().performClick()
        compose.onNodeWithTag("proof-overlay").assertIsDisplayed()
        compose.onNodeWithTag("proof-close").performClick()
        compose.onNodeWithTag("proof-overlay").assertDoesNotExist()
        compose.onNodeWithTag("proof-overlay-open").assertIsDisplayed()
    }

    @Test
    fun longUtilityLabelsAndSheetRemainReachableWithLargeRtlText() {
        render(dark = true, largeRtl = true)
        compose.onNodeWithTag("proof-select").performScrollTo().performClick()
        compose.onNodeWithTag("proof-status").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("proof-overlay-open").performScrollTo().performClick()
        compose.onNodeWithTag("proof-close").performScrollTo().assertIsDisplayed().performClick()
        compose.onNodeWithTag("proof-overlay").assertDoesNotExist()
    }

    private fun render(state: String = "ready", dark: Boolean = false, largeRtl: Boolean = false) {
        compose.setContent {
            CompositionLocalProvider(
                LocalDensity provides Density(density = 1f, fontScale = if (largeRtl) 2f else 1f),
                LocalLayoutDirection provides if (largeRtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
            ) {
                EimirTheme(darkTheme = dark) { VisualRolesProof(initialState = state) }
            }
        }
    }

    private fun awaitPhoto() {
        compose.waitUntil(timeoutMillis = 10_000) {
            compose.onAllNodesWithTag("proof-photo").fetchSemanticsNodes().isNotEmpty()
        }
    }
}
