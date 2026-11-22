package de.eimir.app;

import static org.junit.Assert.*;

import java.time.ZoneId;
import java.util.Locale;
import org.junit.Test;

/** Preview v3 (#2158) carries a Plan's start; it is validated strictly and shown in device time. */
public class PushPreviewScheduleTest {
    @Test public void acceptsOnlyEmptyCalendarDatesAndOffsetInstants() {
        assertEquals("", PushPreview.when(""));
        assertEquals("2026-11-22", PushPreview.when("2026-11-22"));
        assertEquals("2026-11-22T18:00:00+00:00", PushPreview.when("2026-11-22T18:00:00+00:00"));
        for (String invalid : new String[] {"2026-13-01", "2026-11-22T18:00:00", "tomorrow",
                "2026-11-22T18:00:00+00:00 and more text that makes it long"}) {
            try { PushPreview.when(invalid); fail(invalid); }
            catch (RuntimeException rejected) { assertNotNull(rejected); }
        }
    }

    @Test public void instantsAreShownInTheDeviceZoneAndDatesStayCalendarDays() {
        String evening = PushPreview.formatWhen("2026-11-22T18:00:00+00:00", Locale.GERMANY, ZoneId.of("Europe/Berlin"));
        assertTrue(evening, evening.contains("22.11.2026") && evening.contains("19:00"));
        String english = PushPreview.formatWhen("2026-11-22T18:00:00+00:00", Locale.US, ZoneId.of("America/New_York"));
        assertTrue(english, english.contains("Nov 22, 2026") && english.contains("1:00"));
        // A date-only Plan is the same day everywhere.
        String day = PushPreview.formatWhen("2026-11-22", Locale.GERMANY, ZoneId.of("Pacific/Kiritimati"));
        assertTrue(day, day.contains("22.11.2026"));
        assertFalse(day, day.contains(":"));
        assertEquals("", PushPreview.formatWhen("", Locale.GERMANY, ZoneId.of("UTC")));
    }
}
