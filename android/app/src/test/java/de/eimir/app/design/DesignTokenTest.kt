package de.eimir.app.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.float
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The generated token layer is only worth having if it really comes from
 * `design/tokens.json`. These tests read the token file directly and compare it
 * against what the build generated, so a generator regression fails here rather
 * than silently shipping a stale palette.
 */
class DesignTokenTest {
    private val tokens: JsonObject = parseTokenFile()

    @Test
    fun lightSchemeMatchesTheSharedTokenFile() {
        assertSchemeMatchesTokens("light", lightEimirColors)
    }

    @Test
    fun darkSchemeMatchesTheSharedTokenFile() {
        assertSchemeMatchesTokens("dark", darkEimirColors)
    }

    @Test
    fun spacingScaleMatchesTheSharedTokenFile() {
        val spacing = tokens.child("spacing")
        assertEquals(spacing.dimension("1"), eimirSpacing.step1.value, 0.001f)
        assertEquals(spacing.dimension("4"), eimirSpacing.step4.value, 0.001f)
        assertEquals(spacing.dimension("16"), eimirSpacing.step16.value, 0.001f)
    }

    @Test
    fun radiusScaleMatchesTheSharedTokenFile() {
        val radius = tokens.child("radius")
        assertEquals(radius.dimension("card"), eimirRadii.card.value, 0.001f)
        assertEquals(radius.dimension("sheet"), eimirRadii.sheet.value, 0.001f)
    }

    @Test
    fun typographyScaleMatchesTheSharedTokenFile() {
        val heading1 = tokens.child("typography").child("heading1").child("\u0024value")
        assertEquals(
            heading1.text("fontSize").removeSuffix("px").toFloat(),
            heading1Style.fontSize.value,
            0.001f,
        )
        assertEquals(
            heading1.getValue("fontWeight").jsonPrimitive.int,
            heading1Style.fontWeight?.weight,
        )
    }

    @Test
    fun primaryTextContrastMeetsWcagAaInBothSchemes() {
        assertContrast(EimirLightColorScheme.onBackground, EimirLightColorScheme.background)
        assertContrast(EimirLightColorScheme.onSurface, EimirLightColorScheme.surface)
        assertContrast(EimirDarkColorScheme.onBackground, EimirDarkColorScheme.background)
        assertContrast(EimirDarkColorScheme.onSurface, EimirDarkColorScheme.surface)
    }

    @Test
    fun secondaryTextContrastMeetsWcagAaInBothSchemes() {
        assertContrast(EimirLightColorScheme.onSurfaceVariant, EimirLightColorScheme.surface)
        assertContrast(EimirDarkColorScheme.onSurfaceVariant, EimirDarkColorScheme.surface)
    }

    @Test
    fun actionContrastMeetsWcagAaInBothSchemes() {
        assertContrast(EimirLightColorScheme.onPrimary, EimirLightColorScheme.primary)
        assertContrast(EimirDarkColorScheme.onPrimary, EimirDarkColorScheme.primary)
        assertContrast(EimirLightColorScheme.onSecondary, EimirLightColorScheme.secondary)
        assertContrast(EimirDarkColorScheme.onSecondary, EimirDarkColorScheme.secondary)
        assertContrast(EimirLightColorScheme.onTertiary, EimirLightColorScheme.tertiary)
        assertContrast(EimirDarkColorScheme.onTertiary, EimirDarkColorScheme.tertiary)
        assertContrast(EimirLightColorScheme.onError, EimirLightColorScheme.error)
        assertContrast(EimirDarkColorScheme.onError, EimirDarkColorScheme.error)
    }

    @Test
    fun containerTextContrastMeetsWcagAaInBothSchemes() {
        assertContrast(
            EimirLightColorScheme.onPrimaryContainer,
            EimirLightColorScheme.primaryContainer,
        )
        assertContrast(
            EimirDarkColorScheme.onPrimaryContainer,
            EimirDarkColorScheme.primaryContainer,
        )
        assertContrast(
            EimirLightColorScheme.onSecondaryContainer,
            EimirLightColorScheme.secondaryContainer,
        )
        assertContrast(
            EimirDarkColorScheme.onSecondaryContainer,
            EimirDarkColorScheme.secondaryContainer,
        )
        assertContrast(
            EimirLightColorScheme.onTertiaryContainer,
            EimirLightColorScheme.tertiaryContainer,
        )
        assertContrast(
            EimirDarkColorScheme.onTertiaryContainer,
            EimirDarkColorScheme.tertiaryContainer,
        )
    }

    @Test
    fun materialRolesCarryTheDocumentedProductMeaning() {
        // BrandStrong (Rose/Coral) is the standard colour for primary actions;
        // shared means synchronized togetherness, private means personal space.
        // See docs/DESIGN-PRINCIPLES.md 3.1.
        assertEquals(lightEimirColors.brandStrong, EimirLightColorScheme.primary)
        assertEquals(lightEimirColors.shared, EimirLightColorScheme.secondary)
        assertEquals(lightEimirColors.private, EimirLightColorScheme.tertiary)
    }

    @Test
    fun compactGutterChangesAtTheApprovedBoundaryWithoutChangingTheSpacingScale() {
        for (width in listOf(320, 360, 389)) {
            assertEquals(16.dp, spacingForWindowWidth(width.dp).pageMargin)
        }
        for (width in listOf(390, 430, 840)) {
            assertEquals(20.dp, spacingForWindowWidth(width.dp).pageMargin)
        }
        assertEquals(eimirSpacing.sectionGap, spacingForWindowWidth(360.dp).sectionGap)
        assertEquals(
            tokens.child("layout").child("breakpoint").dimension("compactComfortableMin"),
            GeneratedLayoutTokens.COMPACT_COMFORTABLE_MIN,
            0.001f,
        )
    }

    @Test
    fun contentRolesReuseTheSharedMetricsAndTheCorrectFamily() {
        assertEquals(heading2Style.fontSize, eimirContentTypography.personalHeading.fontSize)
        assertEquals(EimirDisplayFamily, eimirContentTypography.personalHeading.fontFamily)
        val semibold = tokens.child("font").child("weight").child("semibold").getValue("\u0024value").jsonPrimitive.int
        assertEquals(semibold, eimirContentTypography.personalHeading.fontWeight?.weight)
        assertEquals(semibold, eimirContentTypography.utilityHeading.fontWeight?.weight)
        assertEquals(heading3Style.fontSize, eimirContentTypography.contentTitle.fontSize)
        assertEquals(EimirDisplayFamily, eimirContentTypography.contentTitle.fontFamily)
        assertEquals(EimirUiFamily, eimirContentTypography.utilityHeading.fontFamily)
        assertEquals(bodyStyle, eimirContentTypography.reading)
        assertEquals(bodySmallStyle, eimirContentTypography.supporting)
    }

    @Test
    fun linkTextAndSupportingCopyRemainReadableWithoutChangingFilledActions() {
        for (colors in listOf(lightEimirColors, darkEimirColors)) {
            for (surface in listOf(colors.background, colors.surface, colors.surfaceRaised)) {
                assertContrast(colors.linkText, surface)
                assertContrast(colors.textSecondary, surface)
            }
            assertContrast(colors.onAccent, colors.brandStrong)
        }
        assertEquals(lightEimirColors.brandStrong, lightEimirColors.linkText)
        assertEquals(darkEimirColors.brand, darkEimirColors.linkText)
    }

    @Test
    fun motionDurationsComeFromTheSharedSource() {
        val duration = tokens.child("motion").child("duration")
        assertEquals(duration.child("standard").text("\u0024value").removeSuffix("ms").toInt(), EimirMotion.standardMillis)
        assertTrue(EimirMotion.fastMillis < EimirMotion.standardMillis)
        assertTrue(EimirMotion.standardMillis < EimirMotion.emphasizedMillis)
    }

    private fun assertSchemeMatchesTokens(name: String, colors: EimirColors) {
        val semantic = tokens.child("color").child("semantic")
        val scheme = tokens.child("color").child("scheme").child(name)

        fun expected(role: String): Color {
            val raw = scheme.child(role).text("\u0024value")
            val hex = if (raw.startsWith("{")) {
                semantic.child(raw.trim('{', '}').substringAfterLast('.')).text("\u0024value")
            } else {
                raw
            }
            return hex.toComposeColor()
        }

        assertEquals(expected("background"), colors.background)
        assertEquals(expected("surface"), colors.surface)
        assertEquals(expected("textPrimary"), colors.textPrimary)
        assertEquals(expected("textSecondary"), colors.textSecondary)
        assertEquals(expected("brand"), colors.brand)
        assertEquals(expected("brandStrong"), colors.brandStrong)
        assertEquals(expected("shared"), colors.shared)
        assertEquals(expected("private"), colors.private)
        assertEquals(expected("error"), colors.error)
        assertEquals(expected("focus"), colors.focus)
        // An eight-digit token carries alpha and must not be read as opaque.
        assertEquals(expected("scrim"), colors.scrim)
        assertEquals(expected("brandGlow"), colors.brandGlow)
    }
}

private fun assertContrast(foreground: Color, background: Color) {
    val ratio = contrastRatio(foreground, background)
    assertTrue("Contrast ratio is only $ratio", ratio >= 4.5)
}

/**
 * The token file sits outside the Gradle module, so the test walks up from the
 * module directory rather than assuming a working directory.
 */
private fun parseTokenFile(): JsonObject {
    var directory: File? = File("").absoluteFile
    while (directory != null) {
        val candidate = File(directory, "design/tokens.json")
        if (candidate.isFile) {
            return Json.parseToJsonElement(candidate.readText()).jsonObject
        }
        directory = directory.parentFile
    }
    throw IllegalStateException("design/tokens.json was not found above the module directory.")
}

private fun JsonObject.child(key: String): JsonObject =
    (this[key] as? JsonObject)
        ?: throw IllegalStateException("Token object is missing: " + key)

private fun JsonObject.text(key: String): String =
    (this[key] as? JsonPrimitive)?.content
        ?: throw IllegalStateException("Token value is missing: " + key)

private fun JsonObject.dimension(key: String): Float =
    child(key).text("\u0024value").removeSuffix("px").toFloat()

/** Token colours are `#RRGGBB` or `#RRGGBBAA`; Compose expects `AARRGGBB`. */
private fun String.toComposeColor(): Color {
    val value = removePrefix("#").uppercase()
    val argb = when (value.length) {
        6 -> "FF$value"
        8 -> value.substring(6, 8) + value.substring(0, 6)
        else -> throw IllegalArgumentException("Unsupported colour token: $this")
    }
    return Color(argb.toLong(16))
}

private fun contrastRatio(first: Color, second: Color): Double {
    val firstLuminance = relativeLuminance(first)
    val secondLuminance = relativeLuminance(second)
    return (max(firstLuminance, secondLuminance) + 0.05) /
        (min(firstLuminance, secondLuminance) + 0.05)
}

private fun relativeLuminance(color: Color): Double =
    0.2126 * linearChannel(color.red.toDouble()) +
        0.7152 * linearChannel(color.green.toDouble()) +
        0.0722 * linearChannel(color.blue.toDouble())

private fun linearChannel(value: Double): Double =
    if (value <= 0.04045) value / 12.92 else Math.pow((value + 0.055) / 1.055, 2.4)
