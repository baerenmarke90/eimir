package de.eimir.app;

import android.annotation.SuppressLint;
import android.content.Context;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.Arrays;
import java.util.HashSet;

/** Direct FCM carries activation routing and an optional encrypted preview, never plaintext or a route. */
// The legacy token-refresh detector does not yet recognize Messaging 26 FID
// mode, whose registration lifecycle is onRegistered/onUnregistered below.
@SuppressLint("MissingFirebaseInstanceTokenRefresh")
public final class EimirFirebaseMessagingService extends FirebaseMessagingService {
    public static boolean acceptsWake(RemoteMessage message, PushActivation active) {
        if (active == null || !"fcm".equals(active.providerKey) || message.getNotification() != null) return false;
        Map<String, String> data = message.getData();
        return new HashSet<>(Arrays.asList("type", "activationId", "preview", "locale")).containsAll(data.keySet())
            && data.containsKey("type") && data.containsKey("activationId") && "wake".equals(data.get("type"))
            && active.activationId.equals(data.get("activationId"));
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        PushActivation active = PushActivation.read(this);
        if (!PushActivation.cleanupPending(this) && acceptsWake(message, active)) {
            Context localized = message.getData().containsKey("locale")
                ? RecipientLanguage.context(this, message.getData().get("locale")) : this;
            if (!message.getData().containsKey("preview")) NativePushNotifications.present(localized, active);
            else {
                PushPreview preview = PushPreview.decrypt(this, active, message.getData().get("preview"));
                if (preview != null) NativePushNotifications.presentPreview(localized, active, preview);
            }
        }
    }

    @Override
    public void onRegistered(String fid) {
        // A callback never establishes ownership. Confirm the SDK identity of
        // the persisted activation, including when its Web bridge is absent.
        NativePushBridge.fcmRegistered(this, fid);
    }

    @Override
    public void onUnregistered(String fid) {
        NativePushBridge.fcmUnregistered(this, fid);
    }
}
