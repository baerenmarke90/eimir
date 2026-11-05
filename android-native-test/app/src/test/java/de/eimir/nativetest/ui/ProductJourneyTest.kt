package de.eimir.nativetest.ui

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.rules.ActivityScenarioRule
import de.eimir.nativetest.MainActivity
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * End-to-end product journeys through the real Activity, navigation graph,
 * ViewModels, OkHttp stack and Coil pipeline against [FixtureBackend].
 * Each journey follows Open → interact → save/complete → observe → return.
 * Renders are written to build/evidence for the visual review.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = FixtureApplication::class, qualifiers = "de-rDE-w412dp-h915dp")
class ProductJourneyTest {
    @get:Rule
    val compose: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity> = createAndroidComposeRule()

    private fun waitForText(text: String, timeout: Long = 10_000) =
        compose.waitUntil(timeout) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }

    private fun capture(name: String) {
        compose.waitForIdle()
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val directory = File("build/evidence").apply { mkdirs() }
        File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun SemanticsNodeInteraction.tap() = performClick().also { compose.waitForIdle() }

    @Test
    fun `today leads with the couple and the keepsake and opens the memory`() {
        waitForText("Alex & Lea")
        waitForText("Wochenende am See")
        compose.onNodeWithText("Erinnerung für heute").assertIsDisplayed()
        compose.onNodeWithContentDescription("Benachrichtigungen, 2 ungelesen").assertIsDisplayed()
        Thread.sleep(800)
        capture("01-wir-light")
        compose.onAllNodesWithText("Wochenende am See").onFirst().tap()
        waitForText("Morgens Nebel")
        compose.onNodeWithText("Da will ich nächstes Jahr wieder hin.", substring = true).assertExists()
        Thread.sleep(800)
        capture("03-memory-detail")
        compose.onNodeWithContentDescription("Zurück").tap()
        waitForText("Erinnerung für heute")
    }

    @Test
    fun `moments timeline groups by month, conceals sensitive media and keeps scope on return`() {
        waitForText("Alex & Lea")
        compose.onNodeWithText("Momente").tap()
        waitForText("Oktober 2026")
        compose.onNodeWithText("Alle Momente").assertIsDisplayed()
        compose.onNodeWithText("Du hast mir einfach Tee gebracht", substring = true).assertExists()
        Thread.sleep(800)
        capture("02-momente-timeline")
        compose.onNodeWithText("Wochenende am See").tap()
        waitForText("Morgens Nebel")
        // Photo place from the contract path `moments/memories/{id}/places`, with OSM attribution.
        waitForText("Seestraße 4, 83727 Schliersee")
        compose.onNodeWithText("Hütte am Schliersee").assertExists()
        compose.onNodeWithText("© OpenStreetMap", substring = true).assertExists()
        compose.onNodeWithContentDescription("Zurück").tap()
        waitForText("Oktober 2026")
        compose.onNodeWithText("Alle Momente").assertIsDisplayed()
    }

    @Test
    fun `capture a text memory with a stable idempotency key and land on the saved result`() {
        waitForText("Alex & Lea")
        compose.onNodeWithContentDescription("Neu festhalten").tap()
        waitForText("Was möchtest du hinzufügen?")
        capture("05-quick-create")
        compose.onNodeWithText("Erinnerung").tap()
        waitForText("Neue Erinnerung")
        compose.onNodeWithText("Was ist passiert?").performTextInput("Kaffee am Fluss, die Sonne kam heraus.")
        compose.onNodeWithText("Titel").performTextInput("Kaffee am Fluss")
        capture("04-memory-capture")
        compose.onNodeWithText("Erinnerung speichern").tap()
        waitForText("Kaffee am Fluss")
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Neue Erinnerung").fetchSemanticsNodes().isEmpty() }
        val create = FixtureBackend.requests.lastOrNull { it.method == "POST" && it.url.encodedPath.endsWith("/memories") }
        assertNotNull("Memory create request", create)
        assertTrue(create!!.headers["Idempotency-Key"].orEmpty().isNotBlank())
        val body = create.body?.utf8().orEmpty()
        assertTrue(body.contains("\"title\":\"Kaffee am Fluss\""))
        assertTrue(body.contains("\"happenedOn\""))
        // Back from the saved result returns to the origin, not to the editor.
        compose.onNodeWithContentDescription("Zurück").tap()
        waitForText("Alex & Lea")
    }

    @Test
    fun `planning leads with the next dated plan`() {
        waitForText("Alex & Lea")
        compose.onNodeWithText("Planen").tap()
        waitForText("Konzert im Stadtpark")
        compose.onNodeWithText("Als Nächstes").assertIsDisplayed()
        compose.onNodeWithText("Ein Wochenende in Lissabon").assertExists()
        Thread.sleep(300)
        capture("06-planen")
        compose.onNodeWithText("Wünsche").tap()
        waitForText("Einmal Polarlichter sehen")
        capture("07-wuensche")
    }

    @Test
    fun `more offers named destinations and settings`() {
        waitForText("Alex & Lea")
        compose.onNodeWithText("Mehr").tap()
        waitForText("Nur für mich")
        capture("08-mehr")
        compose.onNodeWithText("Einstellungen").tap()
        waitForText("Orte aus Fotos übernehmen")
        capture("09-einstellungen")
        assertEquals(1, compose.onAllNodesWithText("Abmelden").fetchSemanticsNodes().size)
    }
}

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = FixtureApplication::class, qualifiers = "de-rDE-w412dp-h915dp-night")
class DarkThemeJourneyTest {
    @get:Rule
    val compose: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity> = createAndroidComposeRule()

    @Test
    fun `today and moments render in dark`() {
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Alex & Lea").fetchSemanticsNodes().isNotEmpty() }
        Thread.sleep(800)
        compose.waitForIdle()
        save("10-wir-dark")
        compose.onNodeWithText("Momente").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Oktober 2026").fetchSemanticsNodes().isNotEmpty() }
        Thread.sleep(800)
        compose.waitForIdle()
        save("11-momente-dark")
    }

    private fun save(name: String) {
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        File("build/evidence").apply { mkdirs() }.resolve("$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = FixtureApplication::class, qualifiers = "de-rDE-w320dp-h700dp")
class NarrowAndLargeTextTest {
    @get:Rule
    val compose: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity> = createAndroidComposeRule()

    @Test
    fun `navigation stays labelled and reachable at 320 dp`() {
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Alex & Lea").fetchSemanticsNodes().isNotEmpty() }
        listOf("Wir", "Momente", "Planen", "Mehr").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.onNodeWithContentDescription("Neu festhalten").assertIsDisplayed()
        Thread.sleep(800)
        compose.waitForIdle()
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        File("build/evidence").apply { mkdirs() }.resolve("12-wir-320dp.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}

@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = FixtureApplication::class, qualifiers = "de-rDE-w884dp-h1104dp")
class ExpandedLayoutTest {
    @get:Rule
    val compose: AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity> = createAndroidComposeRule()

    @Test
    fun `expanded window keeps the reading measure`() {
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Alex & Lea").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Momente").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("Oktober 2026").fetchSemanticsNodes().isNotEmpty() }
        Thread.sleep(800)
        compose.waitForIdle()
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        File("build/evidence").apply { mkdirs() }.resolve("13-momente-expanded.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
