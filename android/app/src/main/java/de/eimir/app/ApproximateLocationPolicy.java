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

    /** With the precise grant (PO 2026-11-17) the GPS provider's last fix may be reused too. */
    static final String[] PRECISE_LAST_KNOWN_PROVIDERS = {
        "fused", LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER
    };

    /** A precise measurement may be reused for at most this long; approximate ones keep the longer default. */
    static final long PRECISE_MAX_AGE_MS = 3 * 60 * 1000L;

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

    static String[] lastKnownProviders(boolean precise) {
        return precise ? PRECISE_LAST_KNOWN_PROVIDERS : LAST_KNOWN_PROVIDERS;
    }

    /**
     * Providers for one precise measurement, best first. The fused provider
     * (Android 12+) already mixes Wi-Fi and satellites; GPS follows; the network
     * provider is the last resort, so a precise choice still yields a position
     * (reported with its real, coarse accuracy).
     */
    static String[] preciseMeasurementProviders(boolean fusedEnabled, boolean gpsEnabled, boolean networkEnabled) {
        java.util.List<String> providers = new java.util.ArrayList<>();
        if (fusedEnabled) providers.add("fused");
        if (gpsEnabled) providers.add(LocationManager.GPS_PROVIDER);
        if (networkEnabled) providers.add(LocationManager.NETWORK_PROVIDER);
        return providers.toArray(new String[0]);
    }

    /** A cached fix of a precise measurement must itself be accurate; a coarse one is measured again. */
    static boolean acceptCached(boolean precise, boolean hasAccuracy, float accuracyMeters) {
        if (!precise) return true;
        return PresencePrecision.isPrecise(true, true, hasAccuracy, accuracyMeters);
    }
}
