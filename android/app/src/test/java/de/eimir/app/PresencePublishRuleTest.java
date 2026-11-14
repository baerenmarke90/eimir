package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PresencePublishRuleTest {
    private static final double HAMBURG_LAT = 53.5511;
    private static final double HAMBURG_LON = 9.9937;
    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void distanceMatchesAKnownCityPair() {
        assertEquals(357.0, PresencePublishRule.distanceKm(HAMBURG_LAT, HAMBURG_LON, 50.9375, 6.9603), 3.0);
    }

    @Test
    public void smallMovementsWaitUntilTheUploadIsSixHoursOld() {
        long recent = NOW - 60_000L;
        assertFalse(PresencePublishRule.due(HAMBURG_LAT, HAMBURG_LON, recent, 53.555, HAMBURG_LON, NOW));
        assertTrue(PresencePublishRule.due(HAMBURG_LAT, HAMBURG_LON,
            NOW - PresencePublishRule.MAX_INTERVAL_MS, 53.555, HAMBURG_LON, NOW));
    }

    @Test
    public void oneKilometreOfMovementPublishesImmediately() {
        assertTrue(PresencePublishRule.due(HAMBURG_LAT, HAMBURG_LON, NOW - 60_000L, 53.565, HAMBURG_LON, NOW));
    }
}
