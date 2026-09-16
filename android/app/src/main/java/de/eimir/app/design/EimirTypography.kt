package de.eimir.app.design

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import de.eimir.app.reference.R
import androidx.compose.ui.unit.sp

/**
 * The shared typography scale mapped onto Material 3 roles.
 *
 * Token line heights are ratios and letter spacing is in `em`; both are
 * resolved against the token font size so a scale change in
 * `design/tokens.json` propagates without a second edit here.
 *
 * The token file specifies `Literata` for emotional/display storytelling and
 * `Instrument Sans` for the primary UI. Both are delivered as self-hosted
 * variable font resources bundled directly with the app. Nothing is fetched at runtime:
 * a font host would put a third party in the path of a private partner app.
 * See `docs/decisions/0005-typography-delivery.md`.
 */

/**
 * The display face (Literata) and UI face (Instrument Sans), from the app's own resources.
 */
val EimirDisplayFamily: FontFamily = FontFamily(
    Font(R.font.literata, FontWeight.Normal),
    Font(R.font.literata, FontWeight.Medium),
    Font(R.font.literata, FontWeight.SemiBold),
    Font(R.font.literata, FontWeight.Bold),
)

val EimirUiFamily: FontFamily = FontFamily(
    Font(R.font.instrument_sans, FontWeight.Normal),
    Font(R.font.instrument_sans, FontWeight.Medium),
    Font(R.font.instrument_sans, FontWeight.SemiBold),
    Font(R.font.instrument_sans, FontWeight.Bold),
)

private fun tokenTextStyle(
    fontSizeSp: Float,
    lineHeightRatio: Float,
    fontWeight: Int,
    letterSpacingEm: Float,
    fontFamily: FontFamily = EimirUiFamily,
): TextStyle = TextStyle(
    fontFamily = fontFamily,
    fontSize = fontSizeSp.sp,
    lineHeight = (fontSizeSp * lineHeightRatio).sp,
    fontWeight = FontWeight(fontWeight),
    letterSpacing = (fontSizeSp * letterSpacingEm).sp,
)

internal val displayStyle = with(GeneratedTypographyTokens.Display) {
    tokenTextStyle(
        FONT_SIZE_SP,
        LINE_HEIGHT_RATIO,
        FONT_WEIGHT,
        LETTER_SPACING_EM,
        // Reserved for editorial, Story, and emotional relationship moments.
        fontFamily = EimirDisplayFamily,
    )
}

internal val heading1Style = with(GeneratedTypographyTokens.Heading1) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val heading2Style = with(GeneratedTypographyTokens.Heading2) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val heading3Style = with(GeneratedTypographyTokens.Heading3) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val titleStyle = with(GeneratedTypographyTokens.Title) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val bodyStyle = with(GeneratedTypographyTokens.Body) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val bodySmallStyle = with(GeneratedTypographyTokens.BodySmall) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val labelStyle = with(GeneratedTypographyTokens.Label) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

internal val metaStyle = with(GeneratedTypographyTokens.Meta) {
    tokenTextStyle(FONT_SIZE_SP, LINE_HEIGHT_RATIO, FONT_WEIGHT, LETTER_SPACING_EM)
}

/**
 * Android carries a wider Material role set than the token scale defines. Roles
 * without their own token reuse the closest documented step rather than
 * inventing an undocumented size.
 */
internal val eimirTypography = Typography(
    displayLarge = displayStyle,
    displayMedium = displayStyle,
    displaySmall = heading1Style,
    headlineLarge = heading1Style,
    headlineMedium = heading2Style,
    headlineSmall = heading3Style,
    titleLarge = heading3Style,
    titleMedium = titleStyle,
    titleSmall = labelStyle,
    bodyLarge = bodyStyle,
    bodyMedium = bodyStyle,
    bodySmall = bodySmallStyle,
    labelLarge = labelStyle,
    labelMedium = labelStyle,
    labelSmall = metaStyle,
)

/** Content meaning chooses the family; existing shared metrics remain the value source. */
@Immutable
data class EimirContentTypography(
    val personalHeading: TextStyle,
    val contentTitle: TextStyle,
    val utilityHeading: TextStyle,
    val sectionHeading: TextStyle,
    val reading: TextStyle,
    val supporting: TextStyle,
)

internal val eimirContentTypography = EimirContentTypography(
    personalHeading = heading2Style.copy(fontFamily = EimirDisplayFamily, fontWeight = FontWeight(GeneratedTypographyTokens.SEMIBOLD_WEIGHT)),
    contentTitle = heading3Style.copy(fontFamily = EimirDisplayFamily),
    utilityHeading = heading2Style.copy(fontWeight = FontWeight(GeneratedTypographyTokens.SEMIBOLD_WEIGHT)),
    sectionHeading = heading3Style,
    reading = bodyStyle,
    supporting = bodySmallStyle,
)
