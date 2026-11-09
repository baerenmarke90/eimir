package de.eimir.app;

/** Shared native upload bounds; no upscaling or portrait crop. */
final class VideoPreparationSettings {
    final int width;
    final int height;
    final int bitrate;

    VideoPreparationSettings(int width, int height) {
        if (Math.min(width, height) <= 0 || Math.max(width, height) > 3840 || Math.min(width, height) > 2160)
            throw new IllegalArgumentException("Invalid video dimensions");
        double scale = Math.min(1, Math.min(1920.0 / Math.max(width, height), 1080.0 / Math.min(width, height)));
        this.width = Math.max(2, (int) (width * scale / 2) * 2);
        this.height = Math.max(2, (int) (height * scale / 2) * 2);
        bitrate = Math.max(1_500_000, (int) (10_000_000L * this.width * this.height / (1920 * 1080)));
    }
}
