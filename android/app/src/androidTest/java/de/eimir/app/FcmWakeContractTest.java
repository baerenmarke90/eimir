package de.eimir.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.os.Bundle;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class FcmWakeContractTest {
    private static final String ACTIVATION = "0b023a34-8cf4-4cde-9c57-7f37fe8b0dd4";
    private static final String OTHER_ACTIVATION = "17a5d357-c71e-4437-9b54-56ce84106980";
    private static final PushActivation CURRENT = new PushActivation(
        "17b4a730-e98c-4af3-b19e-5fae9485200c",
        "https://push-fixture.eimir.invalid/api/v1", "fcm", ACTIVATION,
        "{\"fid\":\"synthetic-fixture\",\"activationId\":\"" + ACTIVATION + "\"}");

    @Test
    public void dataWakeRequiresTheActiveFcmActivation() {
        RemoteMessage wake = message(data("wake", ACTIVATION));
        assertTrue("A content-free data wake matches its FCM activation",
            EimirFirebaseMessagingService.acceptsWake(wake, CURRENT));
        assertFalse("Receipt while disabled cannot create a notification",
            EimirFirebaseMessagingService.acceptsWake(wake, null));
        assertFalse("A retired activation cannot address the current Account",
            EimirFirebaseMessagingService.acceptsWake(message(data("wake", OTHER_ACTIVATION)), CURRENT));
        PushActivation unifiedPush = new PushActivation(CURRENT.accountId, CURRENT.apiBaseUrl,
            "unifiedpush", CURRENT.activationId, null);
        assertFalse("A Firebase wake cannot target a UnifiedPush activation",
            EimirFirebaseMessagingService.acceptsWake(wake, unifiedPush));
    }

    @Test
    public void dataWakeRejectsIncompleteAndAdditionalPayloadFields() {
        Map<String, String> missingActivation = new HashMap<>();
        missingActivation.put("type", "wake");
        assertFalse("An unbound wake has no recipient activation",
            EimirFirebaseMessagingService.acceptsWake(message(missingActivation), CURRENT));
        Map<String, String> missingType = new HashMap<>();
        missingType.put("activationId", ACTIVATION);
        assertFalse("An activation ID alone is not a wake",
            EimirFirebaseMessagingService.acceptsWake(message(missingType), CURRENT));
        assertFalse("Other message types are not notification wakes",
            EimirFirebaseMessagingService.acceptsWake(message(data("navigate", ACTIVATION)), CURRENT));

        for (String extra : new String[] { "accountId", "target", "body" }) {
            Map<String, String> expanded = data("wake", ACTIVATION);
            expanded.put(extra, "synthetic-fixture");
            assertFalse("Additional account, route or content fields violate the wake contract",
                EimirFirebaseMessagingService.acceptsWake(message(expanded), CURRENT));
        }
    }

    @Test
    public void notificationPayloadIsRejectedEvenWithValidDataBinding() {
        Bundle payload = new Bundle();
        payload.putString("type", "wake");
        payload.putString("activationId", ACTIVATION);
        payload.putString("gcm.n.e", "1");
        payload.putString("gcm.n.body", "Synthetic notification fixture");
        RemoteMessage notification = new RemoteMessage(payload);
        assertNotNull("The SDK recognizes the fixture as a notification message",
            notification.getNotification());
        assertFalse("SDK-managed notification payloads cannot bypass shared presentation guards",
            EimirFirebaseMessagingService.acceptsWake(notification, CURRENT));
    }

    private static Map<String, String> data(String type, String activation) {
        Map<String, String> data = new HashMap<>();
        data.put("type", type);
        data.put("activationId", activation);
        return data;
    }

    private static RemoteMessage message(Map<String, String> data) {
        return new RemoteMessage.Builder("synthetic-fixture").setData(data).build();
    }
}
