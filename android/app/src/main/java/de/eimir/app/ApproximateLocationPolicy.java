package de.eimir.app;

import android.location.LocationManager;

/** Pure, device-independent rules for {@link ApproximateLocationPlugin}. */
final class ApproximateLocationPolicy {
    static final float UNKNOWN_ACCURACY_METERS = 5000f;
    static final long MIN_MAX_AGE_MS = 0L;

    /** Providers whose cached fixes may be reused; GPS is never queried directly. */
    static final String[] LAST_KNOWN_PROVIDERS = {
        "fused", LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER
    };

    private ApproximateLocationPolicy() {}

    static long clampMaxAge(Long requested) {
        if (requested == null) return ApproximateLocationPlugin.DEFAULT_MAX_AGE_MS;
        return Math.max(MIN_MAX_AGE_MS, Math.min(requested, ApproximateLocationPlugin.MAX_ACCEPTED_AGE_MS));
    }

    static boolean isFresh(long capturedAtMs, long nowMs, long maxAgeMs) {
        long age = nowMs - capturedAtMs;
        return age >= 0 && age <= maxAgeMs;
    }

    /**
     * Prefers the network provider, which answers from Wi-Fi/cell data without
     * GPS. The fused provider (Android 12+) is the fallback; under a coarse-only
     * grant it also stays approximate. Returns null when neither is enabled.
     */
    static String measurementProvider(boolean networkEnabled, boolean fusedEnabled) {
        if (networkEnabled) return LocationManager.NETWORK_PROVIDER;
        if (fusedEnabled) return "fused";
        return null;
    }
}
