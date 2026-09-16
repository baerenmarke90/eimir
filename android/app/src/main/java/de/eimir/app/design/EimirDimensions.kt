package de.eimir.app.design

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing steps of the shared 4-unit grid, named by step rather than by their
 * current value. Values come from `design/tokens.json`.
 */
@Immutable
data class EimirSpacing(
    val none: Dp,
    val step1: Dp,
    val step2: Dp,
    val step3: Dp,
    val step4: Dp,
    val step5: Dp,
    val step6: Dp,
    val step8: Dp,
    val step10: Dp,
    val step12: Dp,
    val step16: Dp,
    /** Resolved from the current window width; all other spacing steps stay stable. */
    val pageMargin: Dp = step5,
) {
    /** Standard spacing inside a card. */
    val cardPadding: Dp get() = step6

    /** Gap between related elements inside a group. */
    val groupGap: Dp get() = step3

    /** Gap between separate sections. */
    val sectionGap: Dp get() = step8
}

@Immutable
data class EimirRadii(
    val none: Dp,
    val small: Dp,
    val medium: Dp,
    val large: Dp,
    val card: Dp,
    val sheet: Dp,
    val hero: Dp,
    val pill: Dp,
)

internal val eimirSpacing = with(GeneratedDimensionTokens) {
    EimirSpacing(
        none = SPACING_0.dp,
        step1 = SPACING_1.dp,
        step2 = SPACING_2.dp,
        step3 = SPACING_3.dp,
        step4 = SPACING_4.dp,
        step5 = SPACING_5.dp,
        step6 = SPACING_6.dp,
        step8 = SPACING_8.dp,
        step10 = SPACING_10.dp,
        step12 = SPACING_12.dp,
        step16 = SPACING_16.dp,
    )
}

internal val eimirRadii = with(GeneratedDimensionTokens) {
    EimirRadii(
        none = RADIUS_NONE.dp,
        small = RADIUS_SMALL.dp,
        medium = RADIUS_MEDIUM.dp,
        large = RADIUS_LARGE.dp,
        card = RADIUS_CARD.dp,
        sheet = RADIUS_SHEET.dp,
        hero = RADIUS_HERO.dp,
        pill = RADIUS_PILL.dp,
    )
}

/** D7 uses logical window width, including split-screen and configuration changes. */
internal fun spacingForWindowWidth(width: Dp): EimirSpacing = eimirSpacing.copy(
    pageMargin = if (width < GeneratedLayoutTokens.COMPACT_COMFORTABLE_MIN.dp) {
        GeneratedLayoutTokens.MOBILE_GUTTER_NARROW.dp
    } else {
        GeneratedLayoutTokens.MOBILE_GUTTER.dp
    },
)

/** Maximum readable content measure; adaptation does not stretch prose indefinitely. */
val EimirReadingWidth: Dp = GeneratedLayoutTokens.READING_MAX.dp

internal val eimirShapes = Shapes(
    extraSmall = RoundedCornerShape(eimirRadii.small),
    small = RoundedCornerShape(eimirRadii.medium),
    medium = RoundedCornerShape(eimirRadii.large),
    large = RoundedCornerShape(eimirRadii.card),
    extraLarge = RoundedCornerShape(eimirRadii.sheet),
)

/**
 * Minimum interactive size. Material and the Android accessibility guidance
 * both put this at 48 dp, above the 44 px the Web client uses.
 */
val MinimumTouchTarget: Dp = 48.dp

val LocalEimirSpacing = staticCompositionLocalOf { eimirSpacing }

val LocalEimirRadii = staticCompositionLocalOf { eimirRadii }
