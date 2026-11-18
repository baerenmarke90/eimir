package de.eimir.app;

import android.os.SystemClock;

/**
 * Keeps the system splash screen visible until the Web shell reports its first
 * painted view, bounded by a timeout so a slow or failed Web start still shows
 * the Web startup and recovery states.
 */
final class LaunchScreenHold {
    static final long MAX_HOLD_MS = 2500;

    private static volatile boolean released;
    private static volatile long startedAt;

    private LaunchScreenHold() {}

    static void start() {
        released = false;
        startedAt = SystemClock.uptimeMillis();
    }

    static void release() {
        released = true;
    }

    static boolean keepOnScreen() {
        return !released && SystemClock.uptimeMillis() - startedAt < MAX_HOLD_MS;
    }
}
