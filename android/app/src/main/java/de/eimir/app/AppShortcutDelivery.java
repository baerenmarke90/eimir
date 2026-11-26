package de.eimir.app;

import java.util.UUID;

/** One content-free request survives bridge recreation, never a process restart. */
final class AppShortcutDelivery {
    static final AppShortcutDelivery current = new AppShortcutDelivery();
    static final class Request {
        final String id;
        final String action;
        Request(String action) {
            this.id = UUID.randomUUID().toString();
            this.action = action;
        }
    }
    private Request pending;

    static boolean supports(String action) {
        return "moment".equals(action) || "wish".equals(action) || "plan".equals(action);
    }

    synchronized boolean offer(String action) {
        if (!supports(action)) return false;
        pending = new Request(action);
        return true;
    }

    synchronized Request peek() { return pending; }

    synchronized void acknowledge(String id) {
        if (pending != null && pending.id.equals(id)) pending = null;
    }
}
