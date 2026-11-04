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
    private static final Set<String> FIELDS = new HashSet<>(Arrays.asList(
        "v", "notificationId", "kind", "name", "title", "targetType", "digest", "issuedAt", "expiresAt"));

    private PushPreview(JSONObject value) throws Exception {
        notificationId = value.getString("notificationId");
        if (!UUID.fromString(notificationId).toString().equals(notificationId)) throw new IllegalArgumentException();
        kind = value.getString("kind");
        name = label(value.getString("name"), 80);
        title = label(value.getString("title"), 140);
        text = value.getInt("v") == 2 ? label(value.getString("body"), 180) : "";
        targetType = value.getString("targetType");
        digest = value.getBoolean("digest");
    }

    private static String label(String value, int maximum) {
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
            if (!expected.equals(fields) || (version != 1 && version != 2)
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
            case "PARTNER_KISS": return R.string.push_kiss;
            case "THINKING_OF_YOU": return R.string.push_thinking;
            case "PARTNER_CHECK_IN": return R.string.push_check_in;
            case "COUPLE_EXPERIENCE_SHARED": return title.isEmpty() ? R.string.push_shared_moment : R.string.push_shared_moment_title;
            case "PLAN_CREATED": return title.isEmpty() ? R.string.push_plan_created : R.string.push_plan_created_title;
            case "PLAN_CHANGED": return title.isEmpty() ? R.string.push_plan_changed : R.string.push_plan_changed_title;
            case "PLAN_CANCELLED": return R.string.push_plan_cancelled;
            case "WISH_SELECTION_SHARED": return R.string.push_wish_selection_shared;
            case "WISH_SELECTION_READY": return R.string.push_wish_selection_ready;
            case "PHOTO_REACTION": return title.isEmpty() ? R.string.push_photo_reaction : R.string.push_photo_reaction_title;
            case "PARTNER_JOINED": return R.string.push_partner_joined;
            case "TRANSFER_READY": return R.string.push_transfer_ready;
            case "TRANSFER_COMPLETED": return R.string.push_transfer_completed;
            case "TRANSFER_FAILED": return R.string.push_transfer_failed;
            default: return 0;
        }
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public String body(Context context) {
        int resource = bodyResource();
        String summary = context.getString(resource == 0 ? R.string.push_notification_body : resource,
            name.isEmpty() ? context.getString(R.string.push_partner) : name, title);
        return !digest && !text.isEmpty()
            && ("COMMENT_CREATED".equals(kind) || "COUPLE_EXPERIENCE_SHARED".equals(kind))
            ? summary + "\n" + text : summary;
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public String action(Context context) {
        if (bodyResource() == 0 || targetType.isEmpty()) return null;
        if ("COMMENT_CREATED".equals(kind)) return context.getString(R.string.push_view_comments);
        return context.getString("REMINDER".equals(targetType) ? R.string.push_view_reminder :
            "PLAN".equals(targetType) ? R.string.push_view_plan :
            "MEMORY".equals(targetType) || "HEART_MOMENT".equals(targetType) ? R.string.push_view_moment :
            "WISH_SELECTION".equals(targetType) ? R.string.push_view_wish_selection :
            "TRANSFER_EXPORT".equals(targetType) || "TRANSFER_IMPORT".equals(targetType) ? R.string.push_view_transfer :
            R.string.push_view);
    }
}
