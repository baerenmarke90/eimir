package de.eimir.app;

import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Energy-efficient approximate position for partner distance (#1792,
 * docs/m9/PARTNER-LOCATION.md section 6). Only network/fused providers under
 * the coarse permission are used; this plugin never requests GPS, never keeps
 * listening and never stores or sends a position itself.
 */
@CapacitorPlugin(name = "ApproximateLocation", permissions = {
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_COARSE_LOCATION})
})
public class ApproximateLocationPlugin extends Plugin {
    static final long DEFAULT_MAX_AGE_MS = 10 * 60 * 1000L;
    static final long MAX_ACCEPTED_AGE_MS = 24 * 60 * 60 * 1000L;
    static final long TIMEOUT_MS = 20_000L;

    @PluginMethod
    public void current(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location permission is not granted", "PERMISSION_DENIED");
            return;
        }
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null || !LocationManagerCompat.isLocationEnabled(manager)) {
            call.reject("Location services are off", "LOCATION_UNAVAILABLE");
            return;
        }
        long maxAge = ApproximateLocationPolicy.clampMaxAge(call.getLong("maxAgeMs", DEFAULT_MAX_AGE_MS));
        long now = System.currentTimeMillis();

        Location cached = freshestLastKnown(manager, now);
        if (cached != null && ApproximateLocationPolicy.isFresh(cached.getTime(), now, maxAge)) {
            call.resolve(result(cached));
            return;
        }
        String provider = ApproximateLocationPolicy.measurementProvider(
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER),
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && manager.isProviderEnabled(LocationManager.FUSED_PROVIDER));
        if (provider == null) {
            call.reject("No approximate location provider is available", "LOCATION_UNAVAILABLE");
            return;
        }
        measure(call, manager, provider);
    }

    private Location freshestLastKnown(LocationManager manager, long now) {
        Location best = null;
        for (String provider : ApproximateLocationPolicy.LAST_KNOWN_PROVIDERS) {
            try {
                if (!manager.getAllProviders().contains(provider)) continue;
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate == null || candidate.getTime() > now + 2 * 60 * 1000L) continue;
                if (best == null || candidate.getTime() > best.getTime()) best = candidate;
            } catch (SecurityException | IllegalArgumentException unavailable) {
                // A provider that rejects the coarse grant is simply skipped.
            }
        }
        return best;
    }

    private void measure(PluginCall call, LocationManager manager, String provider) {
        CancellationSignal cancellation = new CancellationSignal();
        AtomicBoolean settled = new AtomicBoolean(false);
        Handler timeout = new Handler(Looper.getMainLooper());
        Runnable expire = () -> {
            if (settled.compareAndSet(false, true)) {
                cancellation.cancel();
                call.reject("No position within the time limit", "TIMEOUT");
            }
        };
        timeout.postDelayed(expire, TIMEOUT_MS);
        try {
            LocationManagerCompat.getCurrentLocation(manager, provider, cancellation,
                ContextCompat.getMainExecutor(getContext()), location -> {
                    if (!settled.compareAndSet(false, true)) return;
                    timeout.removeCallbacks(expire);
                    if (location == null) call.reject("No position is available", "LOCATION_UNAVAILABLE");
                    else call.resolve(result(location));
                });
        } catch (SecurityException denied) {
            if (settled.compareAndSet(false, true)) {
                timeout.removeCallbacks(expire);
                call.reject("Location permission is not granted", "PERMISSION_DENIED");
            }
        }
    }

    private static JSObject result(Location location) {
        return new JSObject()
            .put("latitude", location.getLatitude())
            .put("longitude", location.getLongitude())
            .put("accuracyMeters", location.hasAccuracy() ? location.getAccuracy() : ApproximateLocationPolicy.UNKNOWN_ACCURACY_METERS)
            .put("capturedAt", location.getTime());
    }
}
