package de.eimir.app;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ActivityInfo;
import android.graphics.Rect;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
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
                    android.net.Uri.parse("de.sidebyside.app://recent-authentication/oidc"))
                    .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.getPackageName());
            assertEquals("Authentication remains reachable for " + id,
                    "de.eimir.app.LauncherActivity", manager.resolveActivity(callback, 0).activityInfo.name);
            ResolveInfo notification = manager.resolveActivity(EimirPushService.notificationIntent(context), 0);
            assertNotNull("Notification remains reachable for " + id, notification);
            assertEquals("de.eimir.app.LauncherActivity", notification.activityInfo.name);
            assertNotEquals(PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    manager.getComponentEnabledSetting(new ComponentName(context.getPackageName(),
                            "de.eimir.app.LauncherActivity")));
        }
    }

    @Test
    public void everyChoiceOverscansThePlatformMaskInsteadOfShowingAnInsetBadge() throws Exception {
        PackageManager manager = context.getPackageManager();
        float density = context.getResources().getDisplayMetrics().density;
        int viewportPx = Math.round(108 * density);
        int expectedLayerPx = Math.round(132 * density);
        for (String id : LauncherIcons.COMPONENTS.keySet()) {
            ComponentName alias = new ComponentName(
                    context.getPackageName(), LauncherIcons.COMPONENTS.get(id));
            ActivityInfo info = manager.getActivityInfo(alias, PackageManager.MATCH_DISABLED_COMPONENTS);
            Drawable icon = context.getDrawable(info.getIconResource());
            assertTrue(id + " must be an adaptive icon", icon instanceof AdaptiveIconDrawable);
            Drawable foreground = ((AdaptiveIconDrawable) icon).getForeground();
            assertTrue(id + " needs the mask-safe foreground", foreground instanceof LayerDrawable);
            LayerDrawable layers = (LayerDrawable) foreground;
            assertEquals(id, 1, layers.getNumberOfLayers());
            layers.setBounds(0, 0, viewportPx, viewportPx);
            Rect artwork = layers.getDrawable(0).getBounds();
            assertEquals(id + " width", expectedLayerPx, artwork.width());
            assertEquals(id + " height", expectedLayerPx, artwork.height());
            assertTrue(id + " left overscan", artwork.left < 0);
            assertTrue(id + " right overscan", artwork.right > viewportPx);
            assertTrue(id + " top overscan", artwork.top < 0);
            assertTrue(id + " bottom overscan", artwork.bottom > viewportPx);
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
                assertNotNull(shell.getBridge().getPlugin("EimirUnifiedPush"));
            });
        }
    }

    @Test
    public void notificationEntryAcceptsOnlyTheFixedGenericDestination() {
        assertTrue(EimirPushService.isNotificationIntent(EimirPushService.notificationIntent(context)));
        assertTrue(EimirPushService.isNotificationIntent(new Intent(Intent.ACTION_VIEW,
                android.net.Uri.parse("de.sidebyside.app://notifications/"))));
        for (String url : new String[] {
                "https://notifications/", "de.sidebyside.app://notifications.evil/",
                "de.sidebyside.app://user@notifications", "de.sidebyside.app://notifications/item",
                "de.sidebyside.app://notifications?target=/today", "de.sidebyside.app://notifications#item"
        }) {
            assertFalse(url, EimirPushService.isNotificationIntent(new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse(url))));
        }
        assertFalse(EimirPushService.isNotificationIntent(null));
        assertFalse(EimirPushService.isNotificationIntent(new Intent(Intent.ACTION_VIEW)));
        assertFalse(EimirPushService.isNotificationIntent(new Intent(Intent.ACTION_MAIN,
                android.net.Uri.parse("de.sidebyside.app://notifications"))));
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
