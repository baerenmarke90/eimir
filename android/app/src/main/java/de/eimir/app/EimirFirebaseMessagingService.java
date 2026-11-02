package de.eimir.app;

import android.annotation.SuppressLint;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Direct FCM carries activation routing and an optional encrypted preview, never plaintext or a route. */
// The legacy token-refresh detector does not yet recognize Messaging 26 FID
// mode, whose registration lifecycle is onRegistered/onUnregistered below.
@SuppressLint("MissingFirebaseInstanceTokenRefresh")
public final class EimirFirebaseMessagingService extends FirebaseMessagingService {
    public static boolean acceptsWake(RemoteMessage message, PushActivation active) {
        if (active == null || !"fcm".equals(active.providerKey) || message.getNotification() != null) return false;
        Map<String, String> data = message.getData();
        return (data.size() == 2 || (data.size() == 3 && data.containsKey("preview")))
            && data.containsKey("type") && data.containsKey("activationId") && "wake".equals(data.get("type"))
            && active.activationId.equals(data.get("activationId"));
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        PushActivation active = PushActivation.read(this);
        if (!PushActivation.cleanupPending(this) && acceptsWake(message, active)) {
            if (!message.getData().containsKey("preview")) NativePushNotifications.present(this, active);
            else {
                PushPreview preview = PushPreview.decrypt(this, active, message.getData().get("preview"));
                if (preview != null) NativePushNotifications.presentPreview(this, active, preview);
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
