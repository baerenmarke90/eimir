package de.eimir.app;

import static org.junit.Assert.*;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import androidx.test.platform.app.InstrumentationRegistry;
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
            assertNotEquals(PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    manager.getComponentEnabledSetting(new ComponentName(context.getPackageName(),
                            "de.eimir.app.LauncherActivity")));
        }
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
