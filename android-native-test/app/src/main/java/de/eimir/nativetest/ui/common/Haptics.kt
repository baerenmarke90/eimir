package de.eimir.nativetest.ui.common

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View

/** Confirmation feedback for a completed, meaningful action; falls back on pre-R devices. */
fun View.confirmHaptic() {
    performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY,
    )
}
