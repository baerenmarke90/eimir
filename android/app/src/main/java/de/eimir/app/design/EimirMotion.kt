package de.eimir.app.design

import androidx.compose.animation.core.CubicBezierEasing

/** Compose animation APIs also honor the platform animator duration scale. */
object EimirMotion {
    val fastMillis: Int = GeneratedMotionTokens.FAST_MILLIS
    val standardMillis: Int = GeneratedMotionTokens.STANDARD_MILLIS
    val emphasizedMillis: Int = GeneratedMotionTokens.EMPHASIZED_MILLIS
    val standardEasing = with(GeneratedMotionTokens) {
        CubicBezierEasing(STANDARD_EASING_0, STANDARD_EASING_1, STANDARD_EASING_2, STANDARD_EASING_3)
    }
}
