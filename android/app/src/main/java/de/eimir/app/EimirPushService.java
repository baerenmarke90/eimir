package de.eimir.app;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import android.content.Context;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

/** UnifiedPush receipt remains independent of the direct Firebase transport. */
public final class EimirPushService extends PushService {
    @Override
    public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        NativePushBridge.endpoint(this, endpoint, instance);
    }

    @Override
    public void onMessage(PushMessage message, String instance) {
        PushActivation active = PushActivation.read(this);
        if (active == null || !"unifiedpush".equals(active.providerKey)
                || !active.activationId.equals(instance) || !message.getDecrypted()
                || message.getContent().length > 256) return;
        String notificationId = null;
        Context localized;
        try {
            JSONObject payload = new JSONObject(new String(message.getContent(), StandardCharsets.UTF_8));
            if (!"wake".equals(payload.optString("type"))) return;
            HashSet<String> allowed = new HashSet<>(Arrays.asList("type", "notificationId", "locale"));
            Iterator<String> keys = payload.keys();
            while (keys.hasNext()) if (!allowed.contains(keys.next())) return;
            if (payload.has("notificationId")) {
                String raw = payload.getString("notificationId");
                notificationId = UUID.fromString(raw).toString();
                if (!notificationId.equals(raw)) return;
            }
            localized = RecipientLanguage.context(this, payload.optString("locale", "de"));
        } catch (JSONException | IllegalArgumentException invalid) { return; }
        NativePushNotifications.present(localized, active, notificationId);
    }

    @Override
    public void onRegistrationFailed(FailedReason reason, String instance) {
        NativePushBridge.unavailable(this, instance, reason.name());
    }

    @Override
    public void onUnregistered(String instance) {
        NativePushBridge.unavailable(this, instance, "UNREGISTERED");
    }
}
