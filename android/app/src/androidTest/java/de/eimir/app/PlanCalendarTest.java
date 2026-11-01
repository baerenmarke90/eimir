package de.eimir.app;

import static org.junit.Assert.*;

import android.content.Intent;
import android.provider.CalendarContract;
import java.time.Instant;
import java.util.TimeZone;
import org.json.JSONObject;
import org.junit.Test;

public class PlanCalendarTest {
    private JSONObject event(boolean allDay, String start, String end) throws Exception {
        JSONObject data = new JSONObject()
                .put("title", "Our day").put("description", "A quiet day")
                .put("location", "At the lake").put("allDay", allDay)
                .put("startTime", Instant.parse(start).toEpochMilli());
        if (end != null) data.put("endTime", Instant.parse(end).toEpochMilli());
        return data;
    }

    @Test
    public void allDayDatesStayAtUtcMidnightAcrossZonesAndLeapDays() throws Exception {
        TimeZone previous = TimeZone.getDefault();
        try {
            for (String zone : new String[] { "Europe/Berlin", "America/Los_Angeles", "Pacific/Auckland" }) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone));
                Intent intent = PlanCalendarIntent.create(event(true,
                        "2028-02-29T00:00:00Z", "2028-03-01T00:00:00Z"));
                assertEquals(Intent.ACTION_INSERT, intent.getAction());
                assertEquals(CalendarContract.Events.CONTENT_URI, intent.getData());
                assertTrue(intent.getBooleanExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, false));
                assertEquals(Instant.parse("2028-02-29T00:00:00Z").toEpochMilli(),
                        intent.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, -1));
                assertEquals(Instant.parse("2028-03-01T00:00:00Z").toEpochMilli(),
                        intent.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, -1));
                assertEquals("Our day", intent.getStringExtra(CalendarContract.Events.TITLE));
                assertEquals("A quiet day", intent.getStringExtra(CalendarContract.Events.DESCRIPTION));
                assertEquals("At the lake", intent.getStringExtra(CalendarContract.Events.EVENT_LOCATION));
                assertNull(intent.getPackage());
            }
        } finally {
            TimeZone.setDefault(previous);
        }
    }

    @Test
    public void timedInstantsRetainDstOffsetsAndUnknownEnds() throws Exception {
        Intent intent = PlanCalendarIntent.create(event(false,
                "2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z"));
        assertFalse(intent.getBooleanExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true));
        assertEquals(Instant.parse("2026-10-25T00:30:00Z").toEpochMilli(),
                intent.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, -1));
        assertEquals(Instant.parse("2026-10-25T02:30:00Z").toEpochMilli(),
                intent.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, -1));
        assertFalse(PlanCalendarIntent.create(event(false,
                "2026-10-25T00:30:00Z", null)).hasExtra(CalendarContract.EXTRA_EVENT_END_TIME));
    }

    @Test
    public void malformedOrUnboundedBridgeInputCannotBecomeAnIntent() throws Exception {
        JSONObject valid = event(false, "2026-10-25T00:30:00Z", null);
        for (Object start : new Object[] { "1792888200000", true, JSONObject.NULL, 1.5d, 9e15d }) {
            JSONObject data = new JSONObject(valid.toString()).put("startTime", start);
            assertThrows(IllegalArgumentException.class, () -> PlanCalendarIntent.create(data));
        }
        assertThrows(IllegalArgumentException.class, () -> PlanCalendarIntent.create(
                new JSONObject(valid.toString()).put("title", " ")));
        assertThrows(IllegalArgumentException.class, () -> PlanCalendarIntent.create(
                new JSONObject(valid.toString()).put("description", new String(new char[131073]))));
        assertThrows(IllegalArgumentException.class, () -> PlanCalendarIntent.create(
                event(false, "2026-10-25T00:30:00Z", "2026-10-25T00:00:00Z")));
        assertThrows(IllegalArgumentException.class, () -> PlanCalendarIntent.create(
                event(true, "2028-02-29T01:00:00Z", "2028-03-01T01:00:00Z")));
    }
}
