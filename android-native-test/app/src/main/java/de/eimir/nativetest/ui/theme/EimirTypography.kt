package de.eimir.nativetest.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import de.eimir.nativetest.R

/**
 * Literata carries relationship/editorial meaning, Instrument Sans carries
 * navigation, controls and long readable prose (Product Reference v1).
 *
 * Both are the repository's own OFL variable fonts, converted from the Web
 * WOFF2 files without glyph changes; each weight is an instance of the same
 * variable file.
 */
private fun variableFamily(resource: Int, weights: IntRange, step: Int = 100): FontFamily = FontFamily(
    (weights step step).map { weight ->
        Font(
            resId = resource,
            weight = FontWeight(weight),
            variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
        )
    },
)

val InstrumentSans: FontFamily = variableFamily(R.font.instrument_sans, 400..700)
val Literata: FontFamily = variableFamily(R.font.literata, 300..800)

private fun token(
    sizeSp: Float,
    lineHeightRatio: Float,
    weight: Int,
    letterSpacingEm: Float,
    display: Boolean,
): TextStyle = TextStyle(
    fontFamily = if (display) Literata else InstrumentSans,
    fontSize = sizeSp.sp,
    lineHeight = (sizeSp * lineHeightRatio).sp,
    fontWeight = FontWeight(weight),
    letterSpacing = letterSpacingEm.em,
)

object EimirType {
    val display = with(GeneratedTypographyTokens.Display) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val heading1 = with(GeneratedTypographyTokens.Heading1) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val heading2 = with(GeneratedTypographyTokens.Heading2) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val heading3 = with(GeneratedTypographyTokens.Heading3) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val title = with(GeneratedTypographyTokens.Title) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val body = with(GeneratedTypographyTokens.Body) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val bodySmall = with(GeneratedTypographyTokens.BodySmall) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val label = with(GeneratedTypographyTokens.Label) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }
    val meta = with(GeneratedTypographyTokens.Meta) { token(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM, DISPLAY_FAMILY) }

    /** Relationship/editorial voice: keepsakes, memory titles, short thoughts. */
    val editorialLarge = heading2.copy(fontFamily = Literata, fontWeight = FontWeight(560), letterSpacing = (-0.01).em)
    val editorial = heading3.copy(fontFamily = Literata, fontWeight = FontWeight(540))
    val editorialSmall = title.copy(fontFamily = Literata, fontWeight = FontWeight(520))
    val reading = body.copy(lineHeight = (GeneratedTypographyTokens.Body.FONT_SIZE_SP * 1.6f).sp)
}

val EimirTypography = Typography(
    displayLarge = EimirType.display,
    displayMedium = EimirType.heading1,
    displaySmall = EimirType.heading2,
    headlineLarge = EimirType.heading1,
    headlineMedium = EimirType.heading2,
    headlineSmall = EimirType.heading3,
    titleLarge = EimirType.heading3,
    titleMedium = EimirType.title,
    titleSmall = EimirType.label,
    bodyLarge = EimirType.body,
    bodyMedium = EimirType.bodySmall,
    bodySmall = EimirType.meta,
    labelLarge = EimirType.label,
    labelMedium = EimirType.meta,
    labelSmall = EimirType.meta,
)
