package de.eimir.nativetest.ui

import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import de.eimir.nativetest.media.MediaParent
import de.eimir.nativetest.ui.common.AttachmentPhoto
import de.eimir.nativetest.ui.common.MediaRef
import de.eimir.nativetest.ui.common.rememberSensitiveReveals
import de.eimir.nativetest.ui.theme.EimirTheme
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Sensitive/unknown media must never appear unprotected, and reveals stay explicit (#1477). */
@RunWith(RobolectricTestRunner::class)
@Config(application = FixtureApplication::class, qualifiers = "de-rDE")
class SensitiveMediaTest {
    @get:Rule
    val compose = createComposeRule()

    private fun readsOf(id: String) = FixtureBackend.requests.count { it.url.encodedPath.endsWith("/attachments/$id/read-access") }

    @Test
    fun `unknown classification is concealed and not even requested until revealed`() {
        val id = UUID.randomUUID()
        compose.setContent {
            EimirTheme {
                val reveals = rememberSensitiveReveals("test")
                AttachmentPhoto(MediaRef(id, MediaParent.MEMORY, UUID.randomUUID(), isSensitive = null), Modifier.size(200.dp), reveals = reveals)
            }
        }
        compose.onNodeWithText("Sensibler Inhalt").assertIsDisplayed()
        compose.waitForIdle()
        assertEquals(0, readsOf(id.toString()))
        compose.onNodeWithText("Bild anzeigen").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Sensibler Inhalt").assertDoesNotExist()
        compose.waitUntil(10_000) { readsOf(id.toString()) >= 1 }
        compose.onNodeWithText("Sensibler Inhalt").assertDoesNotExist()
    }

    @Test
    fun `marked sensitive media stays covered without a reveal context`() {
        compose.setContent {
            EimirTheme {
                AttachmentPhoto(MediaRef(UUID.randomUUID(), MediaParent.MEMORY, UUID.randomUUID(), isSensitive = true), Modifier.size(200.dp), reveals = null)
            }
        }
        compose.onNodeWithText("Sensibler Inhalt").assertIsDisplayed()
        compose.onNodeWithText("Bild anzeigen").assertDoesNotExist()
    }

    @Test
    fun `ordinary media shows no cover`() {
        compose.setContent {
            EimirTheme {
                AttachmentPhoto(MediaRef(UUID.randomUUID(), MediaParent.MEMORY, UUID.randomUUID(), isSensitive = false), Modifier.size(200.dp))
            }
        }
        compose.onNodeWithText("Sensibler Inhalt").assertDoesNotExist()
    }
}
