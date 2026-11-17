package de.eimir.app;

/**
 * Pure precision rules for partner location (docs/m9/PARTNER-LOCATION.md section 4).
 *
 * A precise choice only counts when the device really holds the precise grant
 * and the fix itself reports a good accuracy; otherwise the position stays on
 * the coarse grid. The device rounds before anything is stored or sent, so the
 * raw fix never leaves it.
 */
final class PresencePrecision {
    /** A fix reported as less accurate than this is not precise (Web bridge and server agree). */
    static final float MAX_PRECISE_ACCURACY_METERS = 500f;
    private static final double APPROXIMATE_GRID_PER_DEGREE = 100.0;
    private static final double PRECISE_GRID_PER_DEGREE = 1000.0;

    private PresencePrecision() {}

    static boolean isPrecise(boolean choicePrecise, boolean fineGranted, boolean hasAccuracy, float accuracyMeters) {
        return choicePrecise && fineGranted && hasAccuracy && accuracyMeters <= MAX_PRECISE_ACCURACY_METERS;
    }

    /** 0.001 degrees (about 111 m) for a precise fix, 0.01 degrees (about 1.1 km) otherwise. */
    static double round(double degrees, boolean precise) {
        double grid = precise ? PRECISE_GRID_PER_DEGREE : APPROXIMATE_GRID_PER_DEGREE;
        return Math.round(degrees * grid) / grid;
    }
}
