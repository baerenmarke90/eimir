package de.eimir.app;

import android.content.Intent;
import android.provider.CalendarContract;
import org.json.JSONObject;

final class PlanCalendarIntent {
    private static final long DAY = 86_400_000L;
    private static final double MAX_DATE = 8_640_000_000_000_000d;

    private PlanCalendarIntent() {}

    static Intent create(JSONObject data) {
        String title = text(data, "title", 2048, true);
        String description = text(data, "description", 131072, false);
        String location = text(data, "location", 8192, false);
        Object allDayValue = data.opt("allDay");
        if (!(allDayValue instanceof Boolean)) throw invalid();
        boolean allDay = (Boolean) allDayValue;
        long start = timestamp(data.opt("startTime"));
        Long end = data.has("endTime") ? timestamp(data.opt("endTime")) : null;
        if (end != null && end <= start) throw invalid();
        // DATE values use UTC midnight and an exclusive next-day end.
        if (allDay && (start % DAY != 0 || end == null || end != start + DAY))
            throw invalid();
        Intent intent = new Intent(Intent.ACTION_INSERT, CalendarContract.Events.CONTENT_URI)
                .putExtra(CalendarContract.Events.TITLE, title)
                .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, allDay)
                .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start);
        if (end != null) intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.longValue());
        if (description != null) intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
        if (location != null) intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location);
        return intent;
    }

    private static String text(JSONObject data, String key, int max, boolean required) {
        Object value = data.opt(key);
        if (!required && value == null) return null;
        if (!(value instanceof String)) throw invalid();
        String result = (String) value;
        if (result.length() > max || result.indexOf('\0') >= 0
                || (required && result.trim().isEmpty())) throw invalid();
        return result;
    }

    private static long timestamp(Object value) {
        if (!(value instanceof Number)) throw invalid();
        double number = ((Number) value).doubleValue();
        if (!Double.isFinite(number) || Math.abs(number) > MAX_DATE
                || number != Math.rint(number)) throw invalid();
        return ((Number) value).longValue();
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid calendar event");
    }
}
