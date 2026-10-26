package de.eimir.app;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.core.app.ActivityScenario;
import java.util.List;
import org.junit.After;
import org.junit.Test;

public class LauncherIconsTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @After
    public void reset() throws Exception {
        LauncherIcons.apply(context, "original");
    }

    @Test
    public void everyChoiceHasExactlyOneLaunchableAliasAndPreservesAuthenticationEntry() throws Exception {
        PackageManager manager = context.getPackageManager();
        for (String id : LauncherIcons.COMPONENTS.keySet()) {
            LauncherIcons.apply(context, id);
            Intent launcher = new Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.getPackageName());
            List<ResolveInfo> activities = manager.queryIntentActivities(launcher, 0);
            assertEquals(id, 1, activities.size());
            assertEquals(LauncherIcons.COMPONENTS.get(id), activities.get(0).activityInfo.name);
            assertEquals("de.eimir.app.LauncherActivity", activities.get(0).activityInfo.targetActivity);
            Intent callback = new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse("de.eimir.app://recent-authentication/oidc"))
                    .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.getPackageName());
            assertEquals("Authentication remains reachable for " + id,
                    "de.eimir.app.LauncherActivity", manager.resolveActivity(callback, 0).activityInfo.name);
            ResolveInfo notification = manager.resolveActivity(NativePushNotifications.notificationIntent(context, new PushActivation(
            "17b4a730-e98c-4af3-b19e-5fae9485200c", "https://example.invalid", "unifiedpush",
            "0f94bddd-bede-4676-a343-7202f117fef9", null)), 0);
            assertNotNull("Notification remains reachable for " + id, notification);
            assertEquals("de.eimir.app.LauncherActivity", notification.activityInfo.name);
            assertNotEquals(PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    manager.getComponentEnabledSetting(new ComponentName(context.getPackageName(),
                            "de.eimir.app.LauncherActivity")));
        }
    }

    @Test
    public void selectedLauncherStartsTheRegisteredNativeBridge() throws Exception {
        LauncherIcons.apply(context, "sage");
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull(launch);
        try (ActivityScenario<android.app.Activity> scenario = ActivityScenario.launch(launch)) {
            scenario.onActivity(activity -> {
                assertTrue(activity instanceof LauncherActivity);
                LauncherActivity shell = (LauncherActivity) activity;
                assertNotNull(shell.getBridge().getPlugin("AppIcon"));
                assertNotNull(shell.getBridge().getPlugin("NativeSessionStorage"));
                assertNotNull(shell.getBridge().getPlugin("EimirPush"));
            });
        }
    }

    @Test
    public void notificationEntryAcceptsOnlyTheFixedGenericDestination() {
        assertTrue(NativePushNotifications.isNotificationIntent(NativePushNotifications.notificationIntent(context, new PushActivation(
            "17b4a730-e98c-4af3-b19e-5fae9485200c", "https://example.invalid", "unifiedpush",
            "0f94bddd-bede-4676-a343-7202f117fef9", null))));
        assertTrue(NativePushNotifications.isNotificationIntent(new Intent(Intent.ACTION_VIEW,
                android.net.Uri.parse("de.eimir.app://notifications/"))));
        for (String url : new String[] {
                "https://notifications/", "de.eimir.app://notifications.evil/",
                "de.eimir.app://user@notifications", "de.eimir.app://notifications/item",
                "de.eimir.app://notifications?target=/today", "de.eimir.app://notifications#item"
        }) {
            assertFalse(url, NativePushNotifications.isNotificationIntent(new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse(url))));
        }
        assertFalse(NativePushNotifications.isNotificationIntent(null));
        assertFalse(NativePushNotifications.isNotificationIntent(new Intent(Intent.ACTION_VIEW)));
        assertFalse(NativePushNotifications.isNotificationIntent(new Intent(Intent.ACTION_MAIN,
                android.net.Uri.parse("de.eimir.app://notifications"))));
    }

    @Test
    public void invalidChoiceLeavesTheExistingLauncherUnchanged() throws Exception {
        LauncherIcons.apply(context, "sage");
        assertThrows(IllegalArgumentException.class, () -> LauncherIcons.apply(context, "../other"));
        assertEquals(PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                context.getPackageManager().getComponentEnabledSetting(new ComponentName(
                        context.getPackageName(), LauncherIcons.COMPONENTS.get("sage"))));
    }
}
