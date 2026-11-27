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
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A silent request to remove tray notices that were read on another device
 * (#2345). It names notice ids only and never presents anything.
 */
@VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
public final class PushWithdrawal {
    static final int MAX_IDS = 20;
    /** A tray notice may wait for days; the server sends a removal for a day. */
    static final long VALIDITY = 24 * 60 * 60;
    private static final Set<String> FIELDS = new HashSet<>(Arrays.asList("v", "notificationIds", "issuedAt", "expiresAt"));

    private PushWithdrawal() {}

    /** The canonical ids of a list, or null when any entry is invalid or the list is out of bounds. */
    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public static Set<String> ids(JSONArray values) {
        if (values == null || values.length() == 0 || values.length() > MAX_IDS) return null;
        Set<String> ids = new LinkedHashSet<>();
        try {
            for (int index = 0; index < values.length(); index++) {
                String raw = values.getString(index);
                String canonical = UUID.fromString(raw).toString();
                if (!canonical.equals(raw)) return null;
                ids.add(canonical);
            }
        } catch (Exception invalid) { return null; }
        return ids;
    }

    static Set<String> decrypt(Context context, PushActivation activation, String compact) {
        try { return decrypt(activation, compact, PushPreviewKeys.read(context, activation), System.currentTimeMillis() / 1000); }
        catch (Exception invalid) { return null; }
    }

    /** The FCM form: ids sealed under the activation's preview key. */
    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public static Set<String> decrypt(PushActivation activation, String compact, byte[] key, long now) {
        try {
            if (compact == null || compact.length() > 3000) return null;
            JWEObject encrypted = JWEObject.parse(compact);
            if (!JWEAlgorithm.DIR.equals(encrypted.getHeader().getAlgorithm())
                    || !EncryptionMethod.A256GCM.equals(encrypted.getHeader().getEncryptionMethod())
                    || !new JOSEObjectType("eimir-push-withdraw+jwe").equals(encrypted.getHeader().getType())
                    || !activation.activationId.equals(encrypted.getHeader().getKeyID())
                    || !encrypted.getHeader().toJSONObject().keySet().equals(new HashSet<>(Arrays.asList("alg", "enc", "typ", "kid")))) return null;
            encrypted.decrypt(new DirectDecrypter(key));
            String raw = encrypted.getPayload().toString();
            if (raw.length() > 1600) return null;
            JSONObject value = new JSONObject(raw);
            Set<String> fields = new HashSet<>();
            Iterator<String> names = value.keys();
            while (names.hasNext()) fields.add(names.next());
            long issued = value.getLong("issuedAt");
            long expires = value.getLong("expiresAt");
            if (!FIELDS.equals(fields) || value.getInt("v") != 1
                    || issued > now + 60 || expires <= now || expires <= issued
                    || expires - issued > VALIDITY) return null;
            return ids(value.getJSONArray("notificationIds"));
        } catch (Exception invalid) { return null; }
    }

    /** Removes the notices from the tray; it shows nothing and wakes no page. */
    static void apply(Context context, PushActivation activation, Set<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        synchronized (PushActivation.class) {
            if (!PushActivation.current(context, activation)) return;
            NativePushNotifications.withdraw(context, ids);
        }
    }
}
