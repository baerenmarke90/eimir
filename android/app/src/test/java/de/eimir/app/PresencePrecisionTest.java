package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PresencePrecisionTest {
    @Test
    public void aFixIsPreciseOnlyWithTheChoiceTheGrantAndAGoodAccuracy() {
        assertTrue(PresencePrecision.isPrecise(true, true, true, 35f));
        assertTrue(PresencePrecision.isPrecise(true, true, true, 500f));
        assertFalse(PresencePrecision.isPrecise(true, true, true, 501f));
        assertFalse(PresencePrecision.isPrecise(true, true, false, 0f));
        // Android 12+ lets people keep "approximate" even after choosing precise.
        assertFalse(PresencePrecision.isPrecise(true, false, true, 35f));
        assertFalse(PresencePrecision.isPrecise(false, true, true, 35f));
    }

    @Test
    public void positionsAreRoundedOnTheDeviceToTheMatchingGrid() {
        assertEquals(53.551, PresencePrecision.round(53.55117, true), 1e-9);
        assertEquals(9.994, PresencePrecision.round(9.99371, true), 1e-9);
        assertEquals(53.55, PresencePrecision.round(53.55117, false), 1e-9);
        assertEquals(9.99, PresencePrecision.round(9.99371, false), 1e-9);
        assertEquals(-0.01, PresencePrecision.round(-0.0051, false), 1e-9);
    }
}
