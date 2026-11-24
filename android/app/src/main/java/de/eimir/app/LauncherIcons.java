package de.eimir.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
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

    private static final String TAG = "LauncherIcons";
    private static final String STORE = "eimir_launcher_icon";
    private static final String PENDING = "pending";

    private static SharedPreferences store(Context context) {
        return context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    /**
     * Records the chosen icon and switches it once the app has left the screen.
     *
     * Disabling the launcher alias that started the visible task makes Android
     * finish that task, even with DONT_KILL_APP. Switching while the person uses
     * the app (for example right after sign-in, when the synced preference
     * arrives) therefore looked like a crash. The switch now waits for
     * {@link #applyPendingAfterLeaving}.
     */
    static synchronized void request(Context context, String iconId) throws Exception {
        String target = COMPONENTS.get(iconId);
        if (target == null) throw new IllegalArgumentException("Unknown icon");
        PackageManager manager = context.getPackageManager();
        // Verify the packaged destination before accepting the request.
        manager.getActivityInfo(component(context, target), PackageManager.MATCH_DISABLED_COMPONENTS);
        if (isCurrent(context, manager, target)) {
            store(context).edit().remove(PENDING).apply();
            return;
        }
        store(context).edit().putString(PENDING, iconId).apply();
    }

    /**
     * Applies a recorded icon when the activity has really left the screen:
     * not for a configuration change, not while the screen is merely off, and
     * not while another app's screen (camera, photo picker) sits on top of the
     * task waiting to return a result.
     */
    static synchronized void applyPendingAfterLeaving(Activity activity) {
        String iconId = store(activity).getString(PENDING, null);
        if (iconId == null || activity.isChangingConfigurations()) return;
        if (!activity.isFinishing()) {
            PowerManager power = activity.getSystemService(PowerManager.class);
            if (power != null && !power.isInteractive()) return;
            if (!ownActivityOnTop(activity)) return;
        }
        store(activity).edit().remove(PENDING).apply();
        try {
            apply(activity, iconId);
        } catch (Exception failure) {
            Log.w(TAG, "Launcher icon could not be applied", failure);
        }
    }

    private static boolean ownActivityOnTop(Activity activity) {
        ActivityManager manager = activity.getSystemService(ActivityManager.class);
        if (manager == null) return false;
        for (ActivityManager.AppTask task : manager.getAppTasks()) {
            ActivityManager.RecentTaskInfo info = task.getTaskInfo();
            @SuppressWarnings("deprecation")
            int taskId = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? info.taskId : info.persistentId;
            if (taskId != activity.getTaskId()) continue;
            ComponentName top = info.topActivity;
            return top == null || activity.getPackageName().equals(top.getPackageName());
        }
        return true;
    }

    private static boolean isCurrent(Context context, PackageManager manager, String target) {
        for (String name : COMPONENTS.values()) {
            if (enabled(context, manager, name) != name.equals(target)) return false;
        }
        return true;
    }

    /** Switches immediately; only safe while no task of this app is visible. */
    static synchronized void apply(Context context, String iconId) throws Exception {
        String target = COMPONENTS.get(iconId);
        if (target == null) throw new IllegalArgumentException("Unknown icon");
        PackageManager manager = context.getPackageManager();
        ComponentName destination = component(context, target);

        // Verify the packaged destination before touching the current launcher.
        manager.getActivityInfo(destination, PackageManager.MATCH_DISABLED_COMPONENTS);
        if (isCurrent(context, manager, target)) return;
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
