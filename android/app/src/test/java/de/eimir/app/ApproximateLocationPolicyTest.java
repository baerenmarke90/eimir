package de.eimir.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ApproximateLocationPolicyTest {
    @Test
    public void networkIsPreferredAndGpsIsNeverSelected() {
        assertEquals("network", ApproximateLocationPolicy.measurementProvider(true, true));
        assertEquals("fused", ApproximateLocationPolicy.measurementProvider(false, true));
        assertNull(ApproximateLocationPolicy.measurementProvider(false, false));
        assertArrayEquals(new String[] {"fused", "network", "passive"},
            ApproximateLocationPolicy.LAST_KNOWN_PROVIDERS);
    }

    @Test
    public void preciseMeasurementPrefersFusedThenGpsAndFallsBackToTheNetwork() {
        assertArrayEquals(new String[] {"fused", "gps", "network"},
            ApproximateLocationPolicy.preciseMeasurementProviders(true, true, true));
        assertArrayEquals(new String[] {"gps", "network"},
            ApproximateLocationPolicy.preciseMeasurementProviders(false, true, true));
        assertArrayEquals(new String[] {"network"},
            ApproximateLocationPolicy.preciseMeasurementProviders(false, false, true));
        assertArrayEquals(new String[0], ApproximateLocationPolicy.preciseMeasurementProviders(false, false, false));
    }

    @Test
    public void gpsCachedFixesAreOnlyReusedForAPreciseChoice() {
        assertArrayEquals(ApproximateLocationPolicy.LAST_KNOWN_PROVIDERS,
            ApproximateLocationPolicy.lastKnownProviders(false));
        assertArrayEquals(new String[] {"fused", "gps", "network", "passive"},
            ApproximateLocationPolicy.lastKnownProviders(true));
    }

    @Test
    public void aCachedFixForAPreciseChoiceMustItselfBeAccurate() {
        assertTrue(ApproximateLocationPolicy.acceptCached(false, false, 0f));
        assertTrue(ApproximateLocationPolicy.acceptCached(true, true, 35f));
        assertTrue(ApproximateLocationPolicy.acceptCached(true, true, 500f));
        assertFalse(ApproximateLocationPolicy.acceptCached(true, true, 501f));
        assertFalse(ApproximateLocationPolicy.acceptCached(true, false, 0f));
    }

    @Test
    public void cachedFixesAreReusedOnlyWithinTheirMaximumAge() {
        long now = 1_000_000_000L;
        assertTrue(ApproximateLocationPolicy.isFresh(now - 60_000L, now, 600_000L));
        assertTrue(ApproximateLocationPolicy.isFresh(now - 600_000L, now, 600_000L));
        assertFalse(ApproximateLocationPolicy.isFresh(now - 600_001L, now, 600_000L));
        assertFalse(ApproximateLocationPolicy.isFresh(now + 1L, now, 600_000L));
    }

    @Test
    public void requestedMaximumAgeIsBounded() {
        assertEquals(ApproximateLocationPlugin.DEFAULT_MAX_AGE_MS, ApproximateLocationPolicy.clampMaxAge(null));
        assertEquals(0L, ApproximateLocationPolicy.clampMaxAge(-5L));
        assertEquals(ApproximateLocationPlugin.MAX_ACCEPTED_AGE_MS,
            ApproximateLocationPolicy.clampMaxAge(Long.MAX_VALUE));
    }
}
