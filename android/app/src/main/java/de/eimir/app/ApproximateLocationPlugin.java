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
import com.getcapacitor.annotation.PermissionCallback;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Energy-efficient approximate position for partner distance (#1792,
 * docs/m9/PARTNER-LOCATION.md section 6). Only network/fused providers under
 * the coarse permission are used; this plugin never requests GPS, never keeps
 * listening and never stores or sends a position itself.
 */
@CapacitorPlugin(name = "ApproximateLocation", permissions = {
    @Permission(alias = "location", strings = {Manifest.permission.ACCESS_COARSE_LOCATION}),
    @Permission(alias = "background", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION})
})
public class ApproximateLocationPlugin extends Plugin {
    static final long DEFAULT_MAX_AGE_MS = 10 * 60 * 1000L;
    static final long MAX_ACCEPTED_AGE_MS = 24 * 60 * 60 * 1000L;
    static final long TIMEOUT_MS = 20_000L;
    private static final String DEVICE_PREFERENCES = "eimir-presence-device";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    /** A random installation identifier; not secret and never derived from hardware. */
    @PluginMethod
    public void deviceId(PluginCall call) {
        android.content.SharedPreferences preferences =
            getContext().getSharedPreferences(DEVICE_PREFERENCES, Context.MODE_PRIVATE);
        String id = preferences.getString("deviceId", null);
        if (id == null) {
            id = UUID.randomUUID().toString();
            preferences.edit().putString("deviceId", id).apply();
        }
        call.resolve(new JSObject().put("deviceId", id));
    }

    private String backgroundPermission() {
        if (getPermissionState("location") != PermissionState.GRANTED) return "prompt";
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "granted";
        PermissionState state = getPermissionState("background");
        if (state == PermissionState.GRANTED) return "granted";
        return state == PermissionState.DENIED ? "denied" : "prompt";
    }

    @PluginMethod
    public void backgroundStatus(PluginCall call) {
        io.execute(() -> call.resolve(new JSObject()
            .put("permission", backgroundPermission())
            .put("enabled", PresenceBackground.isEnabled(getContext()))));
    }

    /** Requests "Allow all the time" after the approximate grant (Android opens its settings page on 11+). */
    @PluginMethod
    public void requestBackgroundPermission(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Approximate location must be granted first", "PERMISSION_DENIED");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("background") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("permission", "granted"));
            return;
        }
        requestPermissionForAlias("background", call, "backgroundPermissionResult");
    }

    @PermissionCallback
    private void backgroundPermissionResult(PluginCall call) {
        call.resolve(new JSObject().put("permission", backgroundPermission()));
    }

    @PluginMethod
    public void enableBackground(PluginCall call) {
        if (!PresenceBackground.hasPermissions(getContext())) {
            call.reject("Background location is not granted", "PERMISSION_DENIED");
            return;
        }
        String instance = call.getString("instance");
        String credential = call.getString("credential");
        String expiresAt = call.getString("expiresAt");
        io.execute(() -> {
            try {
                PresenceBackground.enable(getContext(), instance, credential, expiresAt);
                call.resolve();
            } catch (Exception invalid) {
                call.reject("Background updates could not be enabled", "LOCATION_UNAVAILABLE");
            }
        });
    }

    @PluginMethod
    public void disableBackground(PluginCall call) {
        io.execute(() -> {
            PresenceBackground.disable(getContext());
            call.resolve();
        });
    }

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
