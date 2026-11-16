package de.eimir.app;

/** Pure publish rule shared with the Web bridge: 1 km of movement or a 6-hour-old upload. */
final class PresencePublishRule {
    static final double MIN_DISPLACEMENT_KM = 1.0;
    static final long MAX_INTERVAL_MS = 6 * 60 * 60 * 1000L;
    private static final double EARTH_RADIUS_KM = 6371.0088;

    private PresencePublishRule() {}

    static double distanceKm(double latA, double lonA, double latB, double lonB) {
        double dPhi = Math.toRadians(latB - latA);
        double dLambda = Math.toRadians(lonB - lonA);
        double h = Math.pow(Math.sin(dPhi / 2), 2)
            + Math.cos(Math.toRadians(latA)) * Math.cos(Math.toRadians(latB)) * Math.pow(Math.sin(dLambda / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(h)));
    }

    static boolean due(double lastLat, double lastLon, long lastPublishedAtMs, double lat, double lon, long nowMs) {
        if (nowMs - lastPublishedAtMs >= MAX_INTERVAL_MS) return true;
        return distanceKm(lastLat, lastLon, lat, lon) >= MIN_DISPLACEMENT_KM;
    }
}
