package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import org.junit.Test;

public class SystemHapticFeedbackTest {
    private static final int CURRENT = Build.VERSION_CODES.UPSIDE_DOWN_CAKE;
    private static final int MINIMUM = Build.VERSION_CODES.O;

    private static int constant(String kind, int sdk) {
        return SystemHapticFeedback.constantFor(kind, sdk);
    }

    @Test
    public void tapUsesTheKeyboardFeedbackOnEverySupportedVersion() {
        assertEquals(HapticFeedbackConstants.KEYBOARD_TAP, constant("tap", MINIMUM));
        assertEquals(HapticFeedbackConstants.KEYBOARD_TAP, constant("tap", CURRENT));
    }

    @Test
    public void currentVersionsUseTheSemanticSystemFeedback() {
        assertEquals(HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE, constant("tick", CURRENT));
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, constant("emphasis", CURRENT));
        assertEquals(HapticFeedbackConstants.CONFIRM, constant("success", CURRENT));
        assertEquals(HapticFeedbackConstants.REJECT, constant("refuse", CURRENT));
    }

    @Test
    public void olderVersionsFallBackToAvailableSystemFeedback() {
        assertEquals(HapticFeedbackConstants.CLOCK_TICK, constant("tick", Build.VERSION_CODES.TIRAMISU));
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, constant("success", Build.VERSION_CODES.Q));
        assertEquals(HapticFeedbackConstants.LONG_PRESS, constant("refuse", Build.VERSION_CODES.Q));
    }

    @Test
    public void unknownKindsAreRejected() {
        assertNull(SystemHapticFeedback.constantFor("buzz", CURRENT));
        assertNull(SystemHapticFeedback.constantFor(null, CURRENT));
    }
}
