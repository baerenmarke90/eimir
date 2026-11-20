package de.eimir.app;

import android.content.Context;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.FormatStyle;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/** Bounded device copy for the explicitly public shared-Wish date notices. */
final class WishDatePush {
    private static final Set<String> FIELDS = new HashSet<>(Arrays.asList(
        "kind", "headline", "title", "appointmentStart"));
    final String kind;
    final String headline;
    private final String title;
    private final OffsetDateTime start;

    private WishDatePush(String kind, String headline, String title, OffsetDateTime start) {
        this.kind = kind;
        this.headline = headline;
        this.title = title;
        this.start = start;
    }

    static int headlineResource(String kind) {
        switch (kind) {
            case "WISH_DATE_PROPOSED": return R.string.push_wish_date_proposed;
            case "WISH_DATE_COUNTERED": return R.string.push_wish_date_countered;
            case "WISH_DATE_ACCEPTED": return R.string.push_wish_date_accepted;
            default: return 0;
        }
    }

    static WishDatePush fromFcm(Context context, PushPreview preview) {
        int resource = headlineResource(preview.kind);
        if (resource == 0 || preview.digest) return null;
        boolean accepted = "WISH_DATE_ACCEPTED".equals(preview.kind);
        if (!(accepted ? "PLAN" : "WISH").equals(preview.targetType)) return null;
        String name = preview.name.isEmpty() ? context.getString(R.string.push_partner) : preview.name;
        return create(preview.kind, context.getString(resource, name), preview.title, preview.text);
    }

    static WishDatePush fromWebPush(JSONObject preview) throws JSONException {
        HashSet<String> keys = new HashSet<>();
        preview.keys().forEachRemaining(keys::add);
        if (!FIELDS.equals(keys)) return null;
        return create(preview.getString("kind"), preview.getString("headline"),
            preview.getString("title"), preview.getString("appointmentStart"));
    }

    private static WishDatePush create(String kind, String headline, String title, String start) {
        if (headlineResource(kind) == 0 || headline.trim().isEmpty() || title.trim().isEmpty() || start.length() > 48) return null;
        try {
            OffsetDateTime appointment = OffsetDateTime.parse(start);
            if (!appointment.toInstant().isAfter(Instant.now())) return null;
            return new WishDatePush(kind, PushPreview.label(headline, 165),
                PushPreview.label(title, 140), appointment);
        } catch (DateTimeParseException | IllegalArgumentException invalid) {
            return null;
        }
    }

    String detail(Context context) {
        Locale locale = context.getResources().getConfiguration().getLocales().get(0);
        ZonedDateTime local = start.atZoneSameInstant(ZoneId.systemDefault());
        String date = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(local);
        String time = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(local);
        return title + " · " + date + " · " + time;
    }

    String action(Context context) {
        return context.getString("WISH_DATE_ACCEPTED".equals(kind) ? R.string.push_view_plan : R.string.push_view_wish_date);
    }
}
