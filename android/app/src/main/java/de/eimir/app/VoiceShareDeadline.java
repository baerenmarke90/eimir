package de.eimir.app;

import java.util.function.LongSupplier;

/** One volatile selection and its monotonic deadline, guarded by the plugin's monitor. */
final class VoiceShareDeadline {
    interface Timer {
        void post(Runnable task, long delay);
        void cancel(Runnable task);
    }
    static final long LIFETIME_MS = 10 * 60 * 1000L;
    private final Object lock;
    private final LongSupplier clock;
    private final Timer timer;
    private final Runnable release;
    private long generation;
    private long deadline;
    private Runnable scheduled;

    VoiceShareDeadline(Object lock, LongSupplier clock, Timer timer, Runnable release) {
        this.lock = lock;
        this.clock = clock;
        this.timer = timer;
        this.release = release;
    }

    long start() {
        clear();
        long ticket = generation;
        deadline = clock.getAsLong() + LIFETIME_MS;
        scheduled = () -> {
            synchronized (lock) {
                if (ticket == generation) expireIfDue();
            }
        };
        timer.post(scheduled, LIFETIME_MS);
        return ticket;
    }

    void expireIfDue() {
        if (scheduled != null && clock.getAsLong() >= deadline) clear();
    }

    boolean current(long ticket) {
        expireIfDue();
        return scheduled != null && ticket == generation;
    }

    long generation() {
        expireIfDue();
        return generation;
    }

    void clear() {
        if (scheduled != null) {
            timer.cancel(scheduled);
            scheduled = null;
            release.run();
        }
        generation++;
    }
}
