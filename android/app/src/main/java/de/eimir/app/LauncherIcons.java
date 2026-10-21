package de.eimir.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Exactly one launcher alias, independent of session and the permanent shell. */
final class LauncherIcons {
    static final Map<String, String> COMPONENTS = new LinkedHashMap<>();
    static {
        // Preserve the component used by all previously published APKs.
        COMPONENTS.put("original", "de.eimir.app.MainActivity");
        for (String id : new String[] {"sunset", "sage", "daylight", "lavender", "sand",
                "midnight", "pearl", "dark", "monochrome", "minimal"}) {
            COMPONENTS.put(id, "de.eimir.app.icons." + id);
        }
    }

    private static ComponentName component(Context context, String name) {
        return new ComponentName(context.getPackageName(), name);
    }

    private static boolean enabled(Context context, PackageManager manager, String name) {
        int state = manager.getComponentEnabledSetting(component(context, name));
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT
                    && name.equals(COMPONENTS.get("original")));
    }

    static synchronized void apply(Context context, String iconId) throws Exception {
        String target = COMPONENTS.get(iconId);
        if (target == null) throw new IllegalArgumentException("Unknown icon");
        PackageManager manager = context.getPackageManager();
        ComponentName destination = component(context, target);

        // Verify the packaged destination before touching the current launcher.
        manager.getActivityInfo(destination, PackageManager.MATCH_DISABLED_COMPONENTS);
        boolean unchanged = true;
        for (String name : COMPONENTS.values()) {
            if (enabled(context, manager, name) != name.equals(target)) unchanged = false;
        }
        if (unchanged) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<PackageManager.ComponentEnabledSetting> changes = new ArrayList<>();
            for (String name : COMPONENTS.values()) {
                changes.add(new PackageManager.ComponentEnabledSetting(component(context, name),
                        name.equals(target) ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                                : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP));
            }
            manager.setComponentEnabledSettings(changes);
        } else {
            // Keep a working entry point even if a later operation fails.
            manager.setComponentEnabledSetting(destination,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String name : COMPONENTS.values()) {
                if (!name.equals(target)) {
                    manager.setComponentEnabledSetting(component(context, name),
                            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                            PackageManager.DONT_KILL_APP);
                }
            }
        }
        for (String name : COMPONENTS.values()) {
            int expected = name.equals(target) ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            if (manager.getComponentEnabledSetting(component(context, name)) != expected) {
                throw new IllegalStateException("Launcher component state was not applied");
            }
        }
    }

    private LauncherIcons() {}
}
