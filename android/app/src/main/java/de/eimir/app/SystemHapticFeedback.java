package de.eimir.app;

import android.annotation.SuppressLint;
import android.os.Build;
import android.view.HapticFeedbackConstants;

/**
 * Maps the Web layer's haptic kinds to Android system feedback, so the app
 * feels like the keyboard and the rest of the device. Pure, so the mapping is
 * testable without a device.
 */
final class SystemHapticFeedback {
    private SystemHapticFeedback() {}

    /** Returns the system constant, or {@code null} for an unknown kind. */
    @SuppressLint("InlinedApi") // Every newer constant is guarded by sdk.
    static Integer constantFor(String kind, int sdk) {
        if (kind == null) return null;
        switch (kind) {
            case "tick":
                return sdk >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                    ? HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE
                    : HapticFeedbackConstants.CLOCK_TICK;
            case "tap":
                return HapticFeedbackConstants.KEYBOARD_TAP;
            case "emphasis":
                return HapticFeedbackConstants.VIRTUAL_KEY;
            case "success":
                return sdk >= Build.VERSION_CODES.R
                    ? HapticFeedbackConstants.CONFIRM
                    : HapticFeedbackConstants.VIRTUAL_KEY;
            case "refuse":
                return sdk >= Build.VERSION_CODES.R
                    ? HapticFeedbackConstants.REJECT
                    : HapticFeedbackConstants.LONG_PRESS;
            default:
                return null;
        }
    }
}
