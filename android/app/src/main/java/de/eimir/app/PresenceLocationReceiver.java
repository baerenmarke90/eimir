package de.eimir.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

/**
 * Receives passive location fixes and re-registers background updates after
 * a reboot or an app update. Work is minimal: store the fix and schedule a job.
 */
public class PresenceLocationReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        switch (intent.getAction()) {
            case PresenceBackground.ACTION_LOCATION:
                PendingResult pending = goAsync();
                new Thread(() -> {
                    try { PresenceBackground.onLocation(context, location(intent)); }
                    finally { pending.finish(); }
                }).start();
                break;
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
                PresenceBackground.register(context);
                break;
            default:
                break;
        }
    }

    @SuppressWarnings("deprecation")
    private static Location location(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED, Location.class);
        }
        return intent.getParcelableExtra(LocationManager.KEY_LOCATION_CHANGED);
    }
}
