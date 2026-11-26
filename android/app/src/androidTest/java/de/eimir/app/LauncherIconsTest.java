package de.eimir.app;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ActivityInfo;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.os.SystemClock;
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
        // Clears a recorded choice, because original is now current.
        LauncherIcons.request(context, "original");
    }

    @Test
    public void aRequestKeepsTheCurrentEntryUntilTheAppLeavesTheScreen() throws Exception {
        LauncherIcons.apply(context, "original");
        LauncherIcons.request(context, "sunset");
        Intent launcher = new Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.getPackageName());
        List<ResolveInfo> activities = context.getPackageManager().queryIntentActivities(launcher, 0);
        assertEquals(1, activities.size());
        assertEquals(LauncherIcons.COMPONENTS.get("original"), activities.get(0).activityInfo.name);
        assertEquals("sunset", context.getSharedPreferences("eimir_launcher_icon", Context.MODE_PRIVATE)
                .getString("pending", null));
    }

    @Test(expected = IllegalArgumentException.class)
    public void anUnknownRequestIsRejected() throws Exception {
        LauncherIcons.request(context, "unknown");
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
            ActivityInfo shortcutEntry = manager.getActivityInfo(
                new ComponentName(context.getPackageName(), activities.get(0).activityInfo.name),
                PackageManager.GET_META_DATA);
            assertEquals("Every selected icon exposes the static menu", R.xml.app_shortcuts,
                shortcutEntry.metaData.getInt("android.app.shortcuts"));
            Intent callback = new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse("de.eimir.app://recent-authentication/oidc"))
                    .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.getPackageName());
            assertEquals("Authentication remains reachable for " + id,
                    "de.eimir.app.LauncherActivity", manager.resolveActivity(callback, 0).activityInfo.name);
            Intent calendar = new Intent(Intent.ACTION_VIEW,
                    android.net.Uri.parse("de.eimir.app://calendar/google?calendarGoogle=connected"))
                    .addCategory(Intent.CATEGORY_BROWSABLE).setPackage(context.getPackageName());
            assertEquals("Calendar consent return remains reachable for " + id,
                    "de.eimir.app.LauncherActivity", manager.resolveActivity(calendar, 0).activityInfo.name);
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
        ShortcutManager shortcuts = context.getSystemService(ShortcutManager.class);
        ShortcutInfo wish = null;
        long deadline = SystemClock.uptimeMillis() + 10_000;
        while (wish == null && SystemClock.uptimeMillis() < deadline) {
            for (ShortcutInfo entry : shortcuts.getManifestShortcuts()) {
                if ("wish".equals(entry.getId()) && entry.getActivity() != null
                        && LauncherIcons.COMPONENTS.get("sage").equals(entry.getActivity().getClassName())) wish = entry;
            }
            if (wish == null) SystemClock.sleep(50);
        }
        assertNotNull("The selected icon publishes its parsed static shortcuts", wish);
        Intent shortcut = wish.getIntent();
        assertEquals("The debug shortcut stays inside its installed package",
            context.getPackageName(), shortcut.getComponent().getPackageName());
        assertEquals("de.eimir.app.AppShortcutActivity", shortcut.getComponent().getClassName());
        assertTrue("Exercise the real static-shortcut task flags",
            (shortcut.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TASK) != 0);
        Intent launch = AppShortcutActivity.destination(context, shortcut);
        assertNotNull(launch);
        assertEquals(0, launch.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TASK);
        java.util.concurrent.atomic.AtomicReference<LauncherActivity> original = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicReference<String> coldId = new java.util.concurrent.atomic.AtomicReference<>();
        try (ActivityScenario<android.app.Activity> scenario = ActivityScenario.launch(launch)) {
            scenario.onActivity(activity -> {
                assertTrue(activity instanceof LauncherActivity);
                LauncherActivity shell = (LauncherActivity) activity;
                original.set(shell);
                assertNotNull(shell.getBridge().getPlugin("AppIcon"));
                assertNotNull(shell.getBridge().getPlugin("NativeSessionStorage"));
                assertNotNull(shell.getBridge().getPlugin("EimirPush"));
                assertNotNull(shell.getBridge().getPlugin("PlanCalendar"));
                assertNotNull(shell.getBridge().getPlugin("AppShortcuts").getInstance());
                AppShortcutDelivery.Request cold = AppShortcutDelivery.current.peek();
                assertNotNull("Cold entry waits for the Web shell", cold);
                assertEquals("wish", cold.action);
                coldId.set(cold.id);
                assertFalse("Recreation cannot replay the launch", shell.getIntent().hasExtra("shortcutAction"));
            });
            // The actual disposable Activity receives the destructive OS flags.
            context.startActivity(new Intent(shortcut).putExtra("shortcutAction", "plan"));
            deadline = SystemClock.uptimeMillis() + 10_000;
            while (SystemClock.uptimeMillis() < deadline) {
                AppShortcutDelivery.Request current = AppShortcutDelivery.current.peek();
                if (current != null && !current.id.equals(coldId.get())) break;
                SystemClock.sleep(50);
            }
            AppShortcutDelivery.current.acknowledge(coldId.get());
            AppShortcutDelivery.Request warm = AppShortcutDelivery.current.peek();
            assertNotNull("Warm entry survives the older acknowledgement", warm);
            assertEquals("plan", warm.action);
            scenario.onActivity(activity -> assertSame("A static shortcut must retain the existing WebView owner", original.get(), activity));
            AppShortcutDelivery.current.acknowledge(warm.id);
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
