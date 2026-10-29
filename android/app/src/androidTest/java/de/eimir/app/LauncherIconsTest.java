package de.eimir.app;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ActivityInfo;
import android.graphics.Rect;
import android.graphics.Bitmap;
import android.graphics.drawable.BitmapDrawable;
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
    public void everyChoiceKeepsCompleteArtworkCenteredInsideTheAdaptiveSafeZone() throws Exception {
        PackageManager manager = context.getPackageManager();
        float density = context.getResources().getDisplayMetrics().density;
        int viewportPx = Math.round(108 * density);
        float safeSizePx = 66 * density;
        float safeStart = (viewportPx - safeSizePx) / 2f;
        for (String id : LauncherIcons.COMPONENTS.keySet()) {
            ComponentName alias = new ComponentName(
                    context.getPackageName(), LauncherIcons.COMPONENTS.get(id));
            ActivityInfo info = manager.getActivityInfo(alias, PackageManager.MATCH_DISABLED_COMPONENTS);
            Drawable icon = context.getDrawable(info.getIconResource());
            assertTrue(id + " must be an adaptive icon", icon instanceof AdaptiveIconDrawable);
            assertEquals(id + " needs an opaque native background", 255,
                    ((AdaptiveIconDrawable) icon).getBackground().getAlpha());
            Drawable foreground = ((AdaptiveIconDrawable) icon).getForeground();
            assertTrue(id + " needs the mask-safe foreground", foreground instanceof LayerDrawable);
            LayerDrawable layers = (LayerDrawable) foreground;
            assertEquals(id, 1, layers.getNumberOfLayers());
            layers.setBounds(0, 0, viewportPx, viewportPx);
            Drawable source = layers.getDrawable(0);
            assertTrue(id + " must retain its approved bitmap", source instanceof BitmapDrawable);
            Rect artwork = source.getBounds();
            assertTrue(id + " must not overscan the canvas", artwork.left >= 0 && artwork.top >= 0
                    && artwork.right <= viewportPx && artwork.bottom <= viewportPx);
            Bitmap bitmap = ((BitmapDrawable) source).getBitmap();
            Rect visible = new Rect(bitmap.getWidth(), bitmap.getHeight(), 0, 0);
            for (int y = 0; y < bitmap.getHeight(); y++) {
                for (int x = 0; x < bitmap.getWidth(); x++) {
                    if ((bitmap.getPixel(x, y) >>> 24) == 0) continue;
                    visible.left = Math.min(visible.left, x);
                    visible.top = Math.min(visible.top, y);
                    visible.right = Math.max(visible.right, x + 1);
                    visible.bottom = Math.max(visible.bottom, y + 1);
                }
            }
            assertFalse(id + " must contain visible artwork", visible.isEmpty());
            float scaleX = artwork.width() / (float) bitmap.getWidth();
            float scaleY = artwork.height() / (float) bitmap.getHeight();
            float left = artwork.left + visible.left * scaleX;
            float right = artwork.left + visible.right * scaleX;
            float top = artwork.top + visible.top * scaleY;
            float bottom = artwork.top + visible.bottom * scaleY;
            // Check the actual source pixels in density-independent coordinates,
            // rather than copying the generator's layer-size constant.
            assertTrue(id + " must remain recognizable", right - left >= 48 * density - 1);
            assertTrue(id + " must fit the safe width", right - left <= safeSizePx + 1);
            assertTrue(id + " must fit the safe height", bottom - top <= safeSizePx + 1);
            assertTrue(id + " left edge", left >= safeStart - 1);
            assertTrue(id + " right edge", right <= safeStart + safeSizePx + 1);
            assertTrue(id + " top edge", top >= safeStart - 1);
            assertTrue(id + " bottom edge", bottom <= safeStart + safeSizePx + 1);
            assertEquals(id + " horizontal center", viewportPx / 2f, (left + right) / 2f, 1f);
            assertEquals(id + " vertical center", viewportPx / 2f, (top + bottom) / 2f, 1f);
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
