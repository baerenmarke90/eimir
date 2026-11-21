package de.eimir.app;

import android.content.Context;
import androidx.annotation.VisibleForTesting;
import com.nimbusds.jose.EncryptionMethod;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWEAlgorithm;
import com.nimbusds.jose.JWEObject;
import com.nimbusds.jose.crypto.DirectDecrypter;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONObject;

/** Bounded ephemeral presentation; navigation still resolves the recipient's canonical notice. */
@VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
public final class PushPreview {
    final String notificationId;
    final String kind;
    final String name;
    final String title;
    final String text;
    final String targetType;
    final boolean digest;
    final long issuedAt;
    /** Preview v3 (#2158): a Plan's start (an instant or a calendar date) and its place. */
    final String when;
    final String place;
    private final int version;
    private static final Set<String> FIELDS = new HashSet<>(Arrays.asList(
        "v", "notificationId", "kind", "name", "title", "targetType", "digest", "issuedAt", "expiresAt"));
    private static final Set<String> DETAIL_FIELDS = new HashSet<>(Arrays.asList("body", "when", "place"));
    private static final String[][] REACTIONS = {
        {"LOVE", "\u2764\ufe0f"}, {"LAUGH", "\ud83d\ude02"}, {"SURPRISE", "\ud83d\ude2e"},
        {"SAD", "\ud83d\ude22"}, {"CELEBRATE", "\ud83d\ude4c"}, {"LIKE", "\ud83d\udc4d"}};

    private PushPreview(JSONObject value) throws Exception {
        notificationId = value.getString("notificationId");
        if (!UUID.fromString(notificationId).toString().equals(notificationId)) throw new IllegalArgumentException();
        kind = value.getString("kind");
        name = label(value.getString("name"), 80);
        title = label(value.getString("title"), 140);
        version = value.getInt("v");
        text = version >= 2 ? label(value.getString("body"), 180) : "";
        when = version == 3 ? when(value.getString("when")) : "";
        place = version == 3 ? label(value.getString("place"), 80) : "";
        targetType = value.getString("targetType");
        digest = value.getBoolean("digest");
        issuedAt = value.getLong("issuedAt");
    }

    /** An empty value, a calendar date ("2026-11-22") or an ISO-8601 instant with offset. */
    static String when(String value) {
        if (value.isEmpty()) return value;
        if (value.length() > 40) throw new IllegalArgumentException();
        if (value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) java.time.LocalDate.parse(value);
        else java.time.OffsetDateTime.parse(value);
        return value;
    }

    static String label(String value, int maximum) {
        if (value.codePointCount(0, value.length()) > maximum) throw new IllegalArgumentException();
        for (int index = 0; index < value.length();) {
            int point = value.codePointAt(index);
            int type = Character.getType(point);
            if (Character.isISOControl(point) || (type == Character.FORMAT && point != 0x200d))
                throw new IllegalArgumentException();
            index += Character.charCount(point);
        }
        return value;
    }

    static PushPreview decrypt(Context context, PushActivation activation, String compact) {
        try { return decrypt(activation, compact, PushPreviewKeys.read(context, activation), System.currentTimeMillis() / 1000); }
        catch (Exception invalid) { return null; }
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public static PushPreview decrypt(PushActivation activation, String compact, byte[] key, long now) {
        try {
            if (compact == null || compact.length() > 3000) return null;
            JWEObject encrypted = JWEObject.parse(compact);
            if (!JWEAlgorithm.DIR.equals(encrypted.getHeader().getAlgorithm())
                    || !EncryptionMethod.A256GCM.equals(encrypted.getHeader().getEncryptionMethod())
                    || !new JOSEObjectType("eimir-push-preview+jwe").equals(encrypted.getHeader().getType())
                    || !activation.activationId.equals(encrypted.getHeader().getKeyID())
                    || !encrypted.getHeader().toJSONObject().keySet().equals(new HashSet<>(Arrays.asList("alg", "enc", "typ", "kid")))) return null;
            encrypted.decrypt(new DirectDecrypter(key));
            String raw = encrypted.getPayload().toString();
            if (raw.length() > 1600) return null;
            JSONObject value = new JSONObject(raw);
            Set<String> fields = new HashSet<>();
            java.util.Iterator<String> names = value.keys();
            while (names.hasNext()) fields.add(names.next());
            int version = value.getInt("v");
            Set<String> expected = new HashSet<>(FIELDS);
            if (version == 2) expected.add("body");
            if (version == 3) expected.addAll(DETAIL_FIELDS);
            if (!expected.equals(fields) || version < 1 || version > 3
                    || value.getLong("issuedAt") > now + 60 || value.getLong("expiresAt") <= now
                    || value.getLong("issuedAt") < now - 360
                    || value.getLong("expiresAt") > now + 360
                    || value.getLong("expiresAt") - value.getLong("issuedAt") > 300
                    || value.getLong("expiresAt") <= value.getLong("issuedAt")) return null;
            return new PushPreview(value);
        } catch (Exception invalid) { return null; }
    }

    private int bodyResource() {
        if (digest) return "COMMENT_CREATED".equals(kind)
            ? (title.isEmpty() ? R.string.push_comment_digest : R.string.push_comment_digest_title) : 0;
        switch (kind) {
            case "GENTLE_PROMPT": return "MEMORY".equals(targetType)
                ? (title.isEmpty() ? R.string.push_gentle_memory : R.string.push_gentle_memory_title)
                : R.string.push_gentle_writing;
            case "COMMENT_CREATED": return title.isEmpty() ? R.string.push_comment : R.string.push_comment_title;
            case "REMINDER_CREATED": return title.isEmpty() ? R.string.push_reminder_created : R.string.push_reminder_created_title;
            case "REMINDER_DUE": return title.isEmpty() ? R.string.push_reminder_due : R.string.push_reminder_due_title;
            case "WISH_REMINDER_DUE": return R.string.push_wish_reminder_due;
            case "PARTNER_KISS": return R.string.push_kiss;
            case "HEART_HUNT_HIDDEN": return R.string.push_heart_hidden;
            case "HEART_HUNT_FOUND": return R.string.push_heart_found;
            case "THINKING_OF_YOU": return R.string.push_thinking;
            case "PARTNER_CHECK_IN": return R.string.push_check_in;
            case "COUPLE_EXPERIENCE_SHARED": return title.isEmpty() ? R.string.push_shared_moment : R.string.push_shared_moment_title;
            case "PLAN_CREATED": return title.isEmpty() ? R.string.push_plan_created : R.string.push_plan_created_title;
            case "PLAN_CHANGED": return title.isEmpty() ? R.string.push_plan_changed : R.string.push_plan_changed_title;
            case "PLAN_CANCELLED": return R.string.push_plan_cancelled;
            case "WISH_SELECTION_SHARED": return R.string.push_wish_selection_shared;
            case "WISH_SELECTION_READY": return R.string.push_wish_selection_ready;
            case "WISH_SELECTION_RANDOM_REQUESTED": return R.string.push_wish_selection_random_requested;
            case "WISH_SELECTION_RANDOM_ACCEPTED": return R.string.push_wish_selection_random_accepted;
            case "WISH_SELECTION_RANDOM_DECLINED": return R.string.push_wish_selection_random_declined;
            case "PHOTO_REACTION": return title.isEmpty() ? R.string.push_photo_reaction : R.string.push_photo_reaction_title;
            case "PARTNER_JOINED": return R.string.push_partner_joined;
            // Up to v2 a sent list never showed its title (#1907 E2); v3 names it (#2158).
            case "COLLECTION_SENT": return R.string.push_collection_sent;
            // The picture never appears in a preview; only whose turn it is (#1907 H3).
            case "PICTURE_PING_PONG_TURN": return R.string.push_picture_turn;
            // Up to v2 only who did what (#1969); v3 adds the title and an excerpt (#2158).
            case "SHARED_NOTE_CREATED": return R.string.push_shared_note_created;
            case "SHARED_NOTE_CHANGED": return R.string.push_shared_note_changed;
            case "PICTURE_PING_PONG_FINISHED": return R.string.push_picture_finished;
            // A remote couple game names only the game, never answers, clues,
            // guesses, wishes or moments.
            case "COUPLE_GAME_TURN": return "WHO_OF_US_GAME".equals(targetType) ? R.string.push_game_who_of_us
                : "WISH_DETECTIVE_GAME".equals(targetType) ? R.string.push_game_wish_detective
                : "OUR_MOMENTS_GAME".equals(targetType) ? R.string.push_game_our_moments : 0;
            // Up to v2 a garden seed never showed its words; v3 names the seed and
            // its words (#2158). A bouquet reuses the seed notice with its own text (#1907 H3).
            case "GARDEN_SEED_ARRIVED": return "GARDEN_BOUQUET".equals(targetType)
                ? R.string.push_garden_bouquet : R.string.push_garden_seed;
            // A recap notice names only its period, never a title or a photo (#1744).
            case "RECAP_READY": return !"RECAP".equals(targetType) ? R.string.push_recap_earlier
                : recapYear() > 0 ? (recapMonth() > 0 ? R.string.push_recap_month : R.string.push_recap_year)
                : R.string.push_recap_ready;
            case "RECAP_GREW": return recapYear() > 0
                ? (recapMonth() > 0 ? R.string.push_recap_month_grew : R.string.push_recap_year_grew)
                : R.string.push_recap_grew;
            case "TRANSFER_READY": return R.string.push_transfer_ready;
            case "TRANSFER_COMPLETED": return R.string.push_transfer_completed;
            case "TRANSFER_FAILED": return R.string.push_transfer_failed;
            case "VIDEO_PROCESSING_FAILED": return R.string.push_video_processing_failed;
            default: return 0;
        }
    }

    boolean isNeutralReference() {
        return "ONCE_MESSAGE_RECEIVED".equals(kind) && !digest && name.isEmpty()
            && title.isEmpty() && text.isEmpty() && targetType.isEmpty() && when.isEmpty() && place.isEmpty();
    }

    /**
     * The v3 wording of the kinds that v1 and v2 kept neutral; 0 keeps {@link #bodyResource()}.
     * A digest stays the plural comment summary.
     */
    private int detailResource(String flowers) {
        if (digest) return 0;
        switch (kind) {
            case "REMINDER_DUE": return "PLAN".equals(targetType)
                ? (title.isEmpty() ? R.string.push_plan_starting : R.string.push_plan_starting_title) : 0;
            case "WISH_REMINDER_DUE": return title.isEmpty() ? 0 : R.string.push_wish_reminder_due_title;
            case "PLAN_CANCELLED": return title.isEmpty() ? 0 : R.string.push_plan_cancelled_title;
            case "COLLECTION_SENT": return title.isEmpty() ? 0 : R.string.push_collection_sent_title;
            case "SHARED_NOTE_CREATED": return title.isEmpty() ? 0 : R.string.push_shared_note_created_title;
            case "SHARED_NOTE_CHANGED": return title.isEmpty() ? 0 : R.string.push_shared_note_changed_title;
            case "VIDEO_PROCESSING_FAILED": return title.isEmpty() ? 0 : R.string.push_video_processing_failed_title;
            case "PHOTO_REACTION": return reaction().isEmpty() ? 0
                : title.isEmpty() ? R.string.push_photo_reaction_symbol : R.string.push_photo_reaction_title_symbol;
            // A wrapped surprise seed arrives without a species, so it stays a surprise.
            case "GARDEN_SEED_ARRIVED": return flowers.isEmpty() ? 0
                : "GARDEN_BOUQUET".equals(targetType) ? R.string.push_garden_bouquet_flowers : R.string.push_garden_seed_species;
            default: return 0;
        }
    }

    /** The localized names of the garden codes in the title, joined; unknown codes are skipped. */
    private String flowers(Context context) {
        if (!"GARDEN_SEED_ARRIVED".equals(kind) || title.isEmpty()) return "";
        boolean seed = "GARDEN_SEED".equals(targetType);
        StringBuilder names = new StringBuilder();
        String[] codes = title.split(",", -1);
        if (codes.length > 3 || (seed && codes.length != 1)) return "";
        for (String code : codes) {
            int resource = seed && "TULIP".equals(code) ? R.string.push_garden_tulip_bulb : flowerResource(code);
            if (resource == 0) continue;
            if (names.length() > 0) names.append(", ");
            names.append(context.getString(resource));
        }
        return names.toString();
    }

    private static int flowerResource(String code) {
        switch (code) {
            case "POPPY": return R.string.push_garden_flower_POPPY;
            case "BELLFLOWER": return R.string.push_garden_flower_BELLFLOWER;
            case "STARFLOWER": return R.string.push_garden_flower_STARFLOWER;
            case "SUNFLOWER": return R.string.push_garden_flower_SUNFLOWER;
            case "TULIP": return R.string.push_garden_flower_TULIP;
            case "WATER_LILY": return R.string.push_garden_flower_WATER_LILY;
            case "STRAWBERRY": return R.string.push_garden_flower_STRAWBERRY;
            case "MOONFLOWER": return R.string.push_garden_flower_MOONFLOWER;
            default: return 0;
        }
    }

    private static int wordsResource(String code) {
        switch (code) {
            case "THINKING_OF_YOU": return R.string.push_garden_words_THINKING_OF_YOU;
            case "MISS_YOU": return R.string.push_garden_words_MISS_YOU;
            case "LOOKING_FORWARD": return R.string.push_garden_words_LOOKING_FORWARD;
            case "GOOD_NIGHT": return R.string.push_garden_words_GOOD_NIGHT;
            case "FOR_YOU": return R.string.push_garden_words_FOR_YOU;
            default: return 0;
        }
    }

    /** The symbol of the partner's closed photo reaction preset, or empty. */
    String reaction() {
        if (!"PHOTO_REACTION".equals(kind)) return "";
        for (String[] reaction : REACTIONS) if (reaction[0].equals(text)) return reaction[1];
        return "";
    }

    /** "Sat, 22 Nov 2026, 19:00 · Seeblick" in the device's own time zone and language. */
    private String schedule(Context context) {
        boolean plan = "PLAN".equals(targetType)
            && ("PLAN_CREATED".equals(kind) || "PLAN_CHANGED".equals(kind) || "REMINDER_DUE".equals(kind));
        boolean reminder = "REMINDER_CREATED".equals(kind) && "REMINDER".equals(targetType);
        if (!plan && !reminder) return "";
        java.util.Locale locale = context.getResources().getConfiguration().getLocales().get(0);
        String moment = formatWhen(when, locale, java.time.ZoneId.systemDefault());
        String where = plan ? place : "";
        if (moment.isEmpty()) return where;
        return where.isEmpty() ? moment : moment + " \u00b7 " + where;
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PRIVATE)
    static String formatWhen(String value, java.util.Locale locale, java.time.ZoneId zone) {
        if (value.isEmpty()) return "";
        java.time.format.DateTimeFormatter date = java.time.format.DateTimeFormatter
            .ofLocalizedDate(java.time.format.FormatStyle.MEDIUM).withLocale(locale);
        if (value.length() == 10) return date.format(java.time.LocalDate.parse(value));
        java.time.ZonedDateTime local = java.time.OffsetDateTime.parse(value).atZoneSameInstant(zone);
        return date.format(local) + ", " + java.time.format.DateTimeFormatter
            .ofLocalizedTime(java.time.format.FormatStyle.SHORT).withLocale(locale).format(local);
    }

    /** The authored words a v3 notice adds below its summary. */
    private String excerpt(Context context) {
        switch (kind) {
            case "COMMENT_CREATED":
            case "COUPLE_EXPERIENCE_SHARED":
            case "SHARED_NOTE_CREATED":
            case "SHARED_NOTE_CHANGED": return text;
            case "REMINDER_CREATED":
            case "REMINDER_DUE": return "REMINDER".equals(targetType) ? text : "";
            case "GARDEN_SEED_ARRIVED": {
                int words = "GARDEN_SEED".equals(targetType) ? wordsResource(text) : 0;
                return words == 0 ? "" : context.getString(R.string.push_garden_words_line, context.getString(words));
            }
            default: return "";
        }
    }

    private String detailedBody(Context context, String sender) {
        String flowers = flowers(context);
        int resource = detailResource(flowers);
        if (resource == 0) resource = bodyResource();
        if (resource == 0) return context.getString(R.string.push_notification_body);
        String argument = kind.startsWith("RECAP_") ? recapPeriod(context)
            : "GARDEN_SEED_ARRIVED".equals(kind) ? flowers : title;
        StringBuilder body = new StringBuilder(context.getString(resource, sender, argument, reaction()));
        if (digest) return body.toString();
        for (String line : new String[] {schedule(context), excerpt(context)}) {
            if (!line.isEmpty()) body.append('\n').append(line);
        }
        return body.toString();
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public String body(Context context) {
        int resource = bodyResource();
        String sender = name.isEmpty() ? context.getString(R.string.push_partner) : name;
        int ideas = "WISH_SELECTION_SHARED".equals(kind) && !digest ? ideaCount() : 0;
        if (ideas > 0) {
            // The round invitation names only how many ideas are up for choice (#1907 J1).
            return context.getResources().getQuantityString(R.plurals.push_wish_selection_shared_count, ideas, sender, ideas);
        }
        if (version == 3) return detailedBody(context, sender);
        String summary = context.getString(resource == 0 ? R.string.push_notification_body : resource,
            sender, kind.startsWith("RECAP_") ? recapPeriod(context) : title);
        return !digest && !text.isEmpty()
            && ("COMMENT_CREATED".equals(kind) || "COUPLE_EXPERIENCE_SHARED".equals(kind))
            ? summary + "\n" + text : summary;
    }

    /** The period key a recap notice carries: "2026" or "2026-10"; 0 when absent. */
    private int recapYear() {
        return "RECAP".equals(targetType) && title.matches("[0-9]{4}(-(0[1-9]|1[0-2]))?")
            ? Integer.parseInt(title.substring(0, 4)) : 0;
    }

    private int recapMonth() {
        return recapYear() > 0 && title.length() == 7 ? Integer.parseInt(title.substring(5)) : 0;
    }

    /** "Oktober" within the year the notice was issued, "Oktober 2025" otherwise; "2026" for a year. */
    private String recapPeriod(Context context) {
        int year = recapYear();
        if (year == 0) return "";
        int month = recapMonth();
        if (month == 0) return Integer.toString(year);
        java.util.Locale locale = context.getResources().getConfiguration().getLocales().get(0);
        String name = java.text.DateFormatSymbols.getInstance(locale).getMonths()[month - 1];
        java.util.Calendar issued = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
        issued.setTimeInMillis(issuedAt * 1000);
        return issued.get(java.util.Calendar.YEAR) == year ? name : name + " " + year;
    }

    private int ideaCount() {
        if (!text.matches("[2-5]")) return 0;
        return Integer.parseInt(text);
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public String action(Context context) {
        if (bodyResource() == 0 || targetType.isEmpty()) return null;
        if ("COMMENT_CREATED".equals(kind)) return context.getString(R.string.push_view_comments);
        if ("WISH_SELECTION".equals(targetType)) {
            switch (kind) {
                case "WISH_SELECTION_SHARED": return context.getString(R.string.push_mark_favorites);
                case "WISH_SELECTION_RANDOM_REQUESTED": return context.getString(R.string.push_answer);
                case "WISH_SELECTION_READY":
                case "WISH_SELECTION_RANDOM_ACCEPTED": return context.getString(R.string.push_view_result);
                default: break;
            }
        }
        return context.getString("REMINDER".equals(targetType) ? R.string.push_view_reminder :
            "PLAN".equals(targetType) ? R.string.push_view_plan :
            "MEMORY".equals(targetType) || "HEART_MOMENT".equals(targetType) ? R.string.push_view_moment :
            "WISH_SELECTION".equals(targetType) ? R.string.push_view_wish_selection :
            "COLLECTION".equals(targetType) ? R.string.push_view_list :
            "SHARED_NOTE".equals(targetType) ? R.string.push_view_note :
            "PICTURE_GAME".equals(targetType) ? ("PICTURE_PING_PONG_FINISHED".equals(kind)
                ? R.string.push_view_finished_picture : R.string.push_view_picture) :
            "WHO_OF_US_GAME".equals(targetType) || "WISH_DETECTIVE_GAME".equals(targetType)
                || "OUR_MOMENTS_GAME".equals(targetType) ? R.string.push_view_game :
            "GARDEN_SEED".equals(targetType) || "GARDEN_BOUQUET".equals(targetType) ? R.string.push_view_garden :
            "RECAP".equals(targetType) ? R.string.push_view_recap :
            "WISH".equals(targetType) ? R.string.push_view_wish :
            "TRANSFER_EXPORT".equals(targetType) || "TRANSFER_IMPORT".equals(targetType) ? R.string.push_view_transfer :
            R.string.push_view);
    }
}
