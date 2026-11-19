package de.eimir.app;

import static de.eimir.app.PresenceUploadTicket.Completion.*;
import static org.junit.Assert.*;
import org.junit.Test;

public class PresenceUploadTicketTest {
    private final PresenceUploadTicket sent = new PresenceUploadTicket("first", "fixture", 10);

    @Test public void signOutWinsOverBothDelayedResponses() {
        assertEquals(STOPPED, sent.completion(null, true, false));
        assertEquals(STOPPED, sent.completion(null, false, true));
    }

    @Test public void reactivationWinsEvenWhenCredentialAndFixAreReused() {
        PresenceUploadTicket current = new PresenceUploadTicket("second", "fixture", 10);
        assertEquals(KEEP, sent.completion(current, true, false));
        assertEquals(KEEP, sent.completion(current, false, true));
    }

    @Test public void newerFixSurvivesLateSuccessAndRejection() {
        PresenceUploadTicket newer = new PresenceUploadTicket("first", "fixture", 11);
        assertEquals(KEEP, sent.completion(newer, true, false));
        assertEquals(KEEP, sent.completion(newer, false, true));
        assertEquals(PUBLISH, newer.completion(newer, true, false));
        assertEquals(DISABLE, newer.completion(newer, false, true));
        assertEquals(DISCARD, newer.completion(newer, false, false));
    }
}
