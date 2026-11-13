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
