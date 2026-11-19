package de.eimir.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class VoiceShareDeadlineTest {
    private long now;
    private int released;
    private Runnable scheduled;
    private final VoiceShareDeadline lease = new VoiceShareDeadline(
        this, () -> now, new VoiceShareDeadline.Timer() {
            public void post(Runnable task, long delay) { scheduled = task; }
            public void cancel(Runnable task) { assertSame(scheduled, task); scheduled = null; }
        }, () -> released++);

    @Test public void readAtDeadlineClosesWithoutAPriorPeek() {
        long first = lease.start();
        now = VoiceShareDeadline.LIFETIME_MS - 1;
        assertTrue(lease.current(first));
        now++;
        assertFalse(lease.current(first));
        assertNull(scheduled);
        assertEquals(1, released);
    }

    @Test public void resumeAfterSleepClosesBeforeTheUptimeTimerFires() {
        long first = lease.start();
        now = 2 * VoiceShareDeadline.LIFETIME_MS;
        lease.expireIfDue();
        assertFalse(lease.current(first));
        assertNull(scheduled);
        assertEquals(1, released);
    }

    @Test public void timerClosesAnIdleSelectionAndCannotCloseItsReplacement() {
        long first = lease.start();
        Runnable oldTimer = scheduled;
        now = 20;
        long replacement = lease.start();
        now = VoiceShareDeadline.LIFETIME_MS;
        oldTimer.run();
        assertFalse(lease.current(first));
        assertTrue(lease.current(replacement));
        assertEquals(1, released);
        now += 20;
        scheduled.run();
        assertFalse(lease.current(replacement));
        assertEquals(2, released);
    }
}
