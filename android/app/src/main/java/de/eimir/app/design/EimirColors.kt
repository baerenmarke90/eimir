package de.eimir.app.design

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Semantic colour roles of the Eimir design system.
 *
 * Material 3 has no role for the product meanings this app relies on — shared
 * versus private state, discovery, or the header surface — so those live here
 * and the Material scheme is derived from them rather than maintained beside
 * them. Values come from `design/tokens.json` through [GeneratedColorTokens];
 * no colour literal appears in this file.
 */
@Immutable
data class EimirColors(
    val background: Color,
    val surface: Color,
    val surfaceSubtle: Color,
    val surfaceRaised: Color,
    val surfaceOverlay: Color,
    val headerSurface: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val textInverse: Color,
    val onAccent: Color,
    val border: Color,
    val borderSubtle: Color,
    val brand: Color,
    val brandStrong: Color,
    /** Readable accent text; filled primary actions continue to use brandStrong. */
    val linkText: Color,
    val brandSurface: Color,
    val brandGlow: Color,
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
    val disabledText: Color,
    val disabledSurface: Color,
    val scrim: Color,
    val skeletonBase: Color,
    val skeletonHighlight: Color,
)

internal val lightEimirColors = with(GeneratedColorTokens.Light) {
    EimirColors(
        background = Color(BACKGROUND),
        surface = Color(SURFACE),
        surfaceSubtle = Color(SURFACE_SUBTLE),
        surfaceRaised = Color(SURFACE_RAISED),
        surfaceOverlay = Color(SURFACE_OVERLAY),
        headerSurface = Color(HEADER_SURFACE),
        textPrimary = Color(TEXT_PRIMARY),
        textSecondary = Color(TEXT_SECONDARY),
        textMuted = Color(TEXT_MUTED),
        textInverse = Color(TEXT_INVERSE),
        onAccent = Color(ON_ACCENT),
        border = Color(BORDER),
        borderSubtle = Color(BORDER_SUBTLE),
        brand = Color(BRAND),
        brandStrong = Color(BRAND_STRONG),
        linkText = Color(BRAND_STRONG),
        brandSurface = Color(BRAND_SURFACE),
        brandGlow = Color(BRAND_GLOW),
        shared = Color(SHARED),
        sharedAccent = Color(SHARED_ACCENT),
        sharedSurface = Color(SHARED_SURFACE),
        discovery = Color(DISCOVERY),
        discoverySurface = Color(DISCOVERY_SURFACE),
        private = Color(PRIVATE),
        privateSurface = Color(PRIVATE_SURFACE),
        success = Color(SUCCESS),
        successSurface = Color(SUCCESS_SURFACE),
        warning = Color(WARNING),
        warningSurface = Color(WARNING_SURFACE),
        error = Color(ERROR),
        errorSurface = Color(ERROR_SURFACE),
        focus = Color(FOCUS),
        disabledText = Color(DISABLED_TEXT),
        disabledSurface = Color(DISABLED_SURFACE),
        scrim = Color(SCRIM),
        skeletonBase = Color(SKELETON_BASE),
        skeletonHighlight = Color(SKELETON_HIGHLIGHT),
    )
}

internal val darkEimirColors = with(GeneratedColorTokens.Dark) {
    EimirColors(
        background = Color(BACKGROUND),
        surface = Color(SURFACE),
        surfaceSubtle = Color(SURFACE_SUBTLE),
        surfaceRaised = Color(SURFACE_RAISED),
        surfaceOverlay = Color(SURFACE_OVERLAY),
        headerSurface = Color(HEADER_SURFACE),
        textPrimary = Color(TEXT_PRIMARY),
        textSecondary = Color(TEXT_SECONDARY),
        textMuted = Color(TEXT_MUTED),
        textInverse = Color(TEXT_INVERSE),
        onAccent = Color(ON_ACCENT),
        border = Color(BORDER),
        borderSubtle = Color(BORDER_SUBTLE),
        brand = Color(BRAND),
        brandStrong = Color(BRAND_STRONG),
        linkText = Color(BRAND),
        brandSurface = Color(BRAND_SURFACE),
        brandGlow = Color(BRAND_GLOW),
        shared = Color(SHARED),
        sharedAccent = Color(SHARED_ACCENT),
        sharedSurface = Color(SHARED_SURFACE),
        discovery = Color(DISCOVERY),
        discoverySurface = Color(DISCOVERY_SURFACE),
        private = Color(PRIVATE),
        privateSurface = Color(PRIVATE_SURFACE),
        success = Color(SUCCESS),
        successSurface = Color(SUCCESS_SURFACE),
        warning = Color(WARNING),
        warningSurface = Color(WARNING_SURFACE),
        error = Color(ERROR),
        errorSurface = Color(ERROR_SURFACE),
        focus = Color(FOCUS),
        disabledText = Color(DISABLED_TEXT),
        disabledSurface = Color(DISABLED_SURFACE),
        scrim = Color(SCRIM),
        skeletonBase = Color(SKELETON_BASE),
        skeletonHighlight = Color(SKELETON_HIGHLIGHT),
    )
}

/**
 * Reading this outside [EimirTheme] is a programming error rather than a
 * case to fall back from, so the default throws instead of guessing a scheme.
 */
val LocalEimirColors = staticCompositionLocalOf<EimirColors> {
    error("EimirColors are only available inside EimirTheme.")
}
