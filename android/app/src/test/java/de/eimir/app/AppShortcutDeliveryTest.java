package de.eimir.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class AppShortcutDeliveryTest {
    @Test public void aColdRequestWaitsUntilAcknowledged() {
        AppShortcutDelivery delivery = new AppShortcutDelivery();
        assertNull(delivery.peek());
        for (String action : new String[] {"moment", "wish", "plan"}) {
            assertTrue(delivery.offer(action));
            AppShortcutDelivery.Request pending = delivery.peek();
            assertEquals(action, pending.action);
            assertSame(pending, delivery.peek());
            delivery.acknowledge(pending.id);
            assertNull(delivery.peek());
        }
    }

    @Test public void anOlderAcknowledgementCannotClearANewerTap() {
        AppShortcutDelivery delivery = new AppShortcutDelivery();
        delivery.offer("moment");
        String oldId = delivery.peek().id;
        delivery.offer("plan");
        delivery.acknowledge(oldId);
        assertEquals("plan", delivery.peek().action);
        assertNotEquals(oldId, delivery.peek().id);
        delivery.acknowledge(null);
        assertNotNull(delivery.peek());
    }

    @Test public void unknownActionsDoNotReplaceAValidPendingRequest() {
        AppShortcutDelivery delivery = new AppShortcutDelivery();
        delivery.offer("wish");
        assertFalse(delivery.offer(null));
        assertFalse(delivery.offer("/more/private"));
        assertEquals("wish", delivery.peek().action);
    }
}
