package de.eimir.nativetest.ui.theme

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Product colour roles from `design/tokens.json`.
 *
 * Material 3 has no slot for shared, private or discovery meaning, so those
 * roles stay explicit here and the Material scheme is derived from them in one
 * mapping ([toMaterialScheme]).
 */
@Immutable
data class EimirColors(
    val background: Color,
    val surface: Color,
    val surfaceSubtle: Color,
    val surfaceRaised: Color,
    val surfacePanelTint: Color,
    val headerSurface: Color,
    val pageTintBrand: Color,
    val pageTintShared: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val onAccent: Color,
    val border: Color,
    val borderSubtle: Color,
    val brand: Color,
    val brandStrong: Color,
    val brandSurface: Color,
    val link: Color,
    val shared: Color,
    val sharedAccent: Color,
    val sharedSurface: Color,
    val discovery: Color,
    val discoverySurface: Color,
    val private: Color,
    val privateSurface: Color,
    val success: Color,
    val successSurface: Color,
    val warning: Color,
    val warningSurface: Color,
    val error: Color,
    val errorSurface: Color,
    val focus: Color,
    val scrim: Color,
    val skeletonBase: Color,
    val skeletonHighlight: Color,
    val shadowCard: Color,
    val isDark: Boolean,
) {
    /** The two stroke roles of the eimir. icon grammar (#1225). */
    val iconAccent: Color get() = private
    val iconCool: Color get() = sharedAccent
}

private val LightColors = with(GeneratedColorTokens.Light) {
    EimirColors(
        background = Color(BACKGROUND), surface = Color(SURFACE), surfaceSubtle = Color(SURFACE_SUBTLE),
        surfaceRaised = Color(SURFACE_RAISED), surfacePanelTint = Color(SURFACE_PANEL_TINT),
        headerSurface = Color(HEADER_SURFACE), pageTintBrand = Color(PAGE_TINT_BRAND),
        pageTintShared = Color(PAGE_TINT_SHARED), textPrimary = Color(TEXT_PRIMARY),
        textSecondary = Color(TEXT_SECONDARY), textMuted = Color(TEXT_MUTED), onAccent = Color(ON_ACCENT),
        border = Color(BORDER), borderSubtle = Color(BORDER_SUBTLE), brand = Color(BRAND),
        brandStrong = Color(BRAND_STRONG), brandSurface = Color(BRAND_SURFACE), link = Color(LINK),
        shared = Color(SHARED), sharedAccent = Color(SHARED_ACCENT), sharedSurface = Color(SHARED_SURFACE),
        discovery = Color(DISCOVERY), discoverySurface = Color(DISCOVERY_SURFACE), private = Color(PRIVATE),
        privateSurface = Color(PRIVATE_SURFACE), success = Color(SUCCESS), successSurface = Color(SUCCESS_SURFACE),
        warning = Color(WARNING), warningSurface = Color(WARNING_SURFACE), error = Color(ERROR),
        errorSurface = Color(ERROR_SURFACE), focus = Color(FOCUS), scrim = Color(SCRIM),
        skeletonBase = Color(SKELETON_BASE), skeletonHighlight = Color(SKELETON_HIGHLIGHT),
        shadowCard = Color(SHADOW_CARD), isDark = false,
    )
}

private val DarkColors = with(GeneratedColorTokens.Dark) {
    EimirColors(
        background = Color(BACKGROUND), surface = Color(SURFACE), surfaceSubtle = Color(SURFACE_SUBTLE),
        surfaceRaised = Color(SURFACE_RAISED), surfacePanelTint = Color(SURFACE_PANEL_TINT),
        headerSurface = Color(HEADER_SURFACE), pageTintBrand = Color(PAGE_TINT_BRAND),
        pageTintShared = Color(PAGE_TINT_SHARED), textPrimary = Color(TEXT_PRIMARY),
        textSecondary = Color(TEXT_SECONDARY), textMuted = Color(TEXT_MUTED), onAccent = Color(ON_ACCENT),
        border = Color(BORDER), borderSubtle = Color(BORDER_SUBTLE), brand = Color(BRAND),
        brandStrong = Color(BRAND_STRONG), brandSurface = Color(BRAND_SURFACE), link = Color(LINK),
        shared = Color(SHARED), sharedAccent = Color(SHARED_ACCENT), sharedSurface = Color(SHARED_SURFACE),
        discovery = Color(DISCOVERY), discoverySurface = Color(DISCOVERY_SURFACE), private = Color(PRIVATE),
        privateSurface = Color(PRIVATE_SURFACE), success = Color(SUCCESS), successSurface = Color(SUCCESS_SURFACE),
        warning = Color(WARNING), warningSurface = Color(WARNING_SURFACE), error = Color(ERROR),
        errorSurface = Color(ERROR_SURFACE), focus = Color(FOCUS), scrim = Color(SCRIM),
        skeletonBase = Color(SKELETON_BASE), skeletonHighlight = Color(SKELETON_HIGHLIGHT),
        shadowCard = Color(SHADOW_CARD), isDark = true,
    )
}

fun eimirColors(dark: Boolean): EimirColors = if (dark) DarkColors else LightColors

/** One Material mapping from product roles; components never pick Material defaults ad hoc. */
fun EimirColors.toMaterialScheme(): ColorScheme {
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = brandStrong,
        onPrimary = onAccent,
        primaryContainer = brandSurface,
        onPrimaryContainer = textPrimary,
        secondary = shared,
        onSecondary = if (isDark) background else onAccent,
        secondaryContainer = sharedSurface,
        onSecondaryContainer = textPrimary,
        tertiary = private,
        tertiaryContainer = privateSurface,
        onTertiaryContainer = textPrimary,
        background = background,
        onBackground = textPrimary,
        surface = surface,
        onSurface = textPrimary,
        surfaceVariant = surfaceSubtle,
        onSurfaceVariant = textSecondary,
        surfaceContainerLowest = surfaceRaised,
        surfaceContainerLow = surface,
        surfaceContainer = surface,
        surfaceContainerHigh = surfaceRaised,
        surfaceContainerHighest = surfaceSubtle,
        surfaceBright = surfaceRaised,
        inverseSurface = textPrimary,
        inverseOnSurface = background,
        outline = border,
        outlineVariant = borderSubtle,
        error = error,
        onError = onAccent,
        errorContainer = errorSurface,
        onErrorContainer = textPrimary,
        scrim = scrim,
    )
}

/** Spacing and layout scale on the shared 4-unit grid. */
object Space {
    val xxs: Dp = GeneratedDimensionTokens.SPACING_1.dp
    val xs: Dp = GeneratedDimensionTokens.SPACING_2.dp
    val sm: Dp = GeneratedDimensionTokens.SPACING_3.dp
    val md: Dp = GeneratedDimensionTokens.SPACING_4.dp
    val lg: Dp = GeneratedDimensionTokens.SPACING_5.dp
    val xl: Dp = GeneratedDimensionTokens.SPACING_6.dp
    val xxl: Dp = GeneratedDimensionTokens.SPACING_8.dp
    val xxxl: Dp = GeneratedDimensionTokens.SPACING_12.dp
    val touchTarget: Dp = GeneratedLayoutTokens.APP_TOUCH_TARGET.dp
    val readingMax: Dp = GeneratedLayoutTokens.READING_MAX.dp
    val contentMax: Dp = GeneratedLayoutTokens.CONTENT_MAX.dp
    val comfortableMin: Dp = GeneratedLayoutTokens.COMPACT_COMFORTABLE_MIN.dp

    /** D7: ~16 dp gutters below ~390 dp, 20 dp from there upward. */
    fun gutter(windowWidth: Dp): Dp =
        if (windowWidth < comfortableMin) GeneratedLayoutTokens.MOBILE_GUTTER_NARROW.dp else GeneratedLayoutTokens.MOBILE_GUTTER.dp
}

object Radii {
    val small = RoundedCornerShape(GeneratedDimensionTokens.RADIUS_SMALL.dp)
    val medium = RoundedCornerShape(GeneratedDimensionTokens.RADIUS_MEDIUM.dp)
    val large = RoundedCornerShape(GeneratedDimensionTokens.RADIUS_LARGE.dp)
    val card = RoundedCornerShape(GeneratedDimensionTokens.RADIUS_CARD.dp)
    val sheet = RoundedCornerShape(topStart = GeneratedDimensionTokens.RADIUS_SHEET.dp, topEnd = GeneratedDimensionTokens.RADIUS_SHEET.dp)
    val hero = RoundedCornerShape(GeneratedDimensionTokens.RADIUS_HERO.dp)
    val pill = RoundedCornerShape(percent = 50)
}

/** Motion tokens; [reduced] removes translation/scale but keeps every outcome visible. */
@Immutable
data class EimirMotion(val reduced: Boolean) {
    val fastMillis: Int get() = if (reduced) 0 else GeneratedMotionTokens.FAST_MILLIS
    val standardMillis: Int get() = if (reduced) 0 else GeneratedMotionTokens.STANDARD_MILLIS
    val emphasizedMillis: Int get() = if (reduced) 0 else GeneratedMotionTokens.EMPHASIZED_MILLIS
    val standard: Easing get() = GeneratedMotionTokens.STANDARD_EASING.toEasing()
    val enter: Easing get() = GeneratedMotionTokens.ENTER_EASING.toEasing()
    val exit: Easing get() = GeneratedMotionTokens.EXIT_EASING.toEasing()
}

private fun FloatArray.toEasing(): Easing = CubicBezierEasing(this[0], this[1], this[2], this[3])

val LocalEimirColors = staticCompositionLocalOf { LightColors }
val LocalEimirMotion = staticCompositionLocalOf { EimirMotion(reduced = false) }

object Eimir {
    val colors: EimirColors @Composable get() = LocalEimirColors.current
    val motion: EimirMotion @Composable get() = LocalEimirMotion.current
}

@Composable
fun EimirTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = eimirColors(dark)
    val context = LocalContext.current
    // Android exposes "remove animations" as a zero animator scale; that is
    // the platform's reduced-motion preference.
    val reduced = remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    CompositionLocalProvider(
        LocalEimirColors provides colors,
        LocalEimirMotion provides EimirMotion(reduced),
    ) {
        MaterialTheme(
            colorScheme = colors.toMaterialScheme(),
            typography = EimirTypography,
            shapes = Shapes(
                extraSmall = Radii.small,
                small = Radii.medium,
                medium = Radii.large,
                large = Radii.card,
                extraLarge = Radii.sheet,
            ),
            content = content,
        )
    }
}
