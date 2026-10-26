package de.eimir.app;

import java.nio.charset.StandardCharsets;
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
                || !active.activationId.equals(instance) || !message.getDecrypted()) return;
        try {
            JSONObject payload = new JSONObject(new String(message.getContent(), StandardCharsets.UTF_8));
            if (payload.length() != 1 || !"wake".equals(payload.optString("type"))) return;
        } catch (JSONException invalid) { return; }
        NativePushNotifications.present(this, active);
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
