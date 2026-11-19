package de.eimir.app;

/** Identity of the pending measurement that a network response may consume. */
record PresenceUploadTicket(String activation, String credential, long capturedAt) {
    enum Completion { STOPPED, KEEP, DISABLE, PUBLISH, DISCARD }

    Completion completion(PresenceUploadTicket current, boolean published, boolean stop) {
        if (current == null) return Completion.STOPPED;
        if (!equals(current) || capturedAt <= 0) return Completion.KEEP;
        if (stop) return Completion.DISABLE;
        return published ? Completion.PUBLISH : Completion.DISCARD;
    }
}
