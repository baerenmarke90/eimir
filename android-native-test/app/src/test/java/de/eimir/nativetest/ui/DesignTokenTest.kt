package de.eimir.nativetest.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import de.eimir.nativetest.ui.theme.eimirColors
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The native palette is generated from design/tokens.json and must keep WCAG AA text contrast. */
class DesignTokenTest {
    private fun contrast(a: Color, b: Color): Double {
        val l1 = a.luminance() + 0.05
        val l2 = b.luminance() + 0.05
        return maxOf(l1, l2).toDouble() / minOf(l1, l2).toDouble()
    }

    @Test
    fun `generated colours match the token file`() {
        val tokens = Json.parseToJsonElement(File("../../design/tokens.json").readText()).jsonObject
        val light = tokens["color"]!!.jsonObject["scheme"]!!.jsonObject["light"]!!.jsonObject
        val brand = light["brandStrong"]!!.jsonObject["\$value"]!!.jsonPrimitive.content
        assertEquals(Color(0xFF000000 or brand.removePrefix("#").toLong(16)), eimirColors(dark = false).brandStrong)
    }

    @Test
    fun `text roles keep AA contrast on their surfaces in both themes`() {
        listOf(false, true).forEach { dark ->
            val c = eimirColors(dark)
            listOf(c.background, c.surface, c.surfaceRaised, c.headerSurface).forEach { surface ->
                assertTrue("textPrimary dark=$dark", contrast(c.textPrimary, surface) >= 4.5)
                assertTrue("textSecondary dark=$dark", contrast(c.textSecondary, surface) >= 4.5)
            }
            assertTrue("onAccent on brandStrong dark=$dark", contrast(c.onAccent, c.brandStrong) >= 4.5)
        }
    }
}
