package de.eimir.app;

/** Keep progress persistence and system notifications off the byte-transfer hot path. */
final class TransferProgress {
    private int published;
    private long publishedAt;

    boolean advance(int percent, long elapsedMillis) {
        if (percent <= published) return false;
        // The first visible percentage and the final percentage need immediate feedback.
        // Intermediate changes are coalesced, never delayed on the I/O thread.
        if (published > 0 && percent < 99 && elapsedMillis - publishedAt < 1000) return false;
        published = percent;
        publishedAt = elapsedMillis;
        return true;
    }
}
