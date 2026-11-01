package de.eimir.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class NativePushNotificationBindingTest {
    private static final String ACCOUNT = "17b4a730-e98c-4af3-b19e-5fae9485200c";
    private static final String OTHER_ACCOUNT = "0f94bddd-bede-4676-a343-7202f117fef9";
    private static final String API = "https://push-fixture.eimir.invalid/api/v1";
    private static final String ACTIVATION = "0b023a34-8cf4-4cde-9c57-7f37fe8b0dd4";
    private static final String OTHER_ACTIVATION = "17a5d357-c71e-4437-9b54-56ce84106980";
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Before
    public void prepare() {
        PushActivation.clear(context);
        PushActivation.cleanupPending(context, false);
    }

    @After
    public void cleanup() {
        NativePushNotifications.cancel(context);
        PushActivation.clear(context);
        PushActivation.cleanupPending(context, false);
    }

    @Test
    public void notificationTapRequiresEveryCurrentActivationBinding() {
        PushActivation active = activation(ACCOUNT, API, "fcm", ACTIVATION);
        PushActivation.save(context, active);
        Intent current = NativePushNotifications.notificationIntent(context, active);
        assertTrue("The current activation can open its generic notification",
            NativePushNotifications.matches(context, current));
        PushActivation.cleanupPending(context, true);
        assertFalse("A pending FCM retirement invalidates its tap even before stale ownership can be cleared",
            NativePushNotifications.matches(context, current));
        PushActivation.cleanupPending(context, false);

        PushActivation[] foreign = {
            activation(OTHER_ACCOUNT, API, "fcm", ACTIVATION),
            activation(ACCOUNT, "https://other-fixture.eimir.invalid/api/v1", "fcm", ACTIVATION),
            activation(ACCOUNT, API, "unifiedpush", ACTIVATION),
            activation(ACCOUNT, API, "fcm", OTHER_ACTIVATION)
        };
        for (PushActivation candidate : foreign) {
            assertFalse("A notification cannot select a different activation binding",
                NativePushNotifications.matches(context,
                    NativePushNotifications.notificationIntent(context, candidate)));
        }

        Intent unbound = new Intent(Intent.ACTION_VIEW,
            Uri.parse("de.eimir.app://notifications"), context, LauncherActivity.class);
        assertTrue("The unbound URL still has the fixed generic structure",
            NativePushNotifications.isNotificationIntent(unbound));
        assertFalse("A structurally valid external URL is not a bound notification tap",
            NativePushNotifications.matches(context, unbound));

        Intent withoutFilterBinding = new Intent(current);
        if (current.getCategories() != null) {
            for (String category : current.getCategories()) withoutFilterBinding.removeCategory(category);
        }
        assertFalse("Snapshot extras alone cannot replace the platform filter binding",
            NativePushNotifications.matches(context, withoutFilterBinding));

        PushActivation.clear(context);
        assertFalse("An old notification cannot open after local disable",
            NativePushNotifications.matches(context, current));
    }

    @Test
    public void pendingIntentIdentityCannotRetargetAnEarlierActivationTap() {
        PushActivation previous = activation(ACCOUNT, API, "fcm", ACTIVATION);
        PushActivation next = activation(OTHER_ACCOUNT, API, "fcm", OTHER_ACTIVATION);
        PushActivation.save(context, previous);
        Intent oldIntent = NativePushNotifications.notificationIntent(context, previous);
        PendingIntent oldTap = pendingIntent(oldIntent);
        PendingIntent nextTap = null;
        try {
            PushActivation.save(context, next);
            Intent nextIntent = NativePushNotifications.notificationIntent(context, next);
            nextTap = pendingIntent(nextIntent);
            assertFalse("Activation changes the platform PendingIntent filter identity",
                oldIntent.filterEquals(nextIntent));
            assertFalse("Updating the new notification cannot rewrite the old PendingIntent",
                oldTap.equals(nextTap));
            assertFalse("The old tap remains bound to the retired activation",
                NativePushNotifications.matches(context, oldIntent));
            assertTrue("The new tap remains bound to the current activation",
                NativePushNotifications.matches(context, nextIntent));
        } finally {
            oldTap.cancel();
            if (nextTap != null) nextTap.cancel();
        }
    }

    @Test
    public void restoringSavedActivationPreservesItsNotificationBinding() {
        PushActivation original = activation(ACCOUNT, API, "fcm", ACTIVATION)
            .withEndpoint("{\"fid\":\"synthetic-fixture\",\"activationId\":\"" + ACTIVATION + "\"}");
        Intent tap = NativePushNotifications.notificationIntent(context, original);
        PushActivation.save(context, original);
        PushActivation restored = PushActivation.read(context);
        assertNotNull("The saved activation is available without an Activity", restored);
        assertTrue("Restoration preserves the exact activation ID",
            original.activationId.equals(restored.activationId));
        assertTrue("Restoration preserves the registration without logging its value",
            original.endpointValue.equals(restored.endpointValue));
        assertTrue("The restored activation is current", PushActivation.current(context, restored));
        assertTrue("An activation survives process-style state restoration without retargeting its tap",
            NativePushNotifications.matches(context, tap));
    }

    private PendingIntent pendingIntent(Intent intent) {
        return PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PushActivation activation(String account, String api, String provider, String id) {
        return new PushActivation(account, api, provider, id, null);
    }
}
