package de.eimir.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class PlanFilesUrlTest {
    private static final String ROUTE = "/api/v1/spaces/22222222-2222-4222-8222-222222222222"
        + "/attachments/7aa71de7-2da2-438a-bce2-d315c48d05ae/content";

    @Test
    public void acceptsConfiguredServerContentPath() {
        assertNotNull(PlanFilesPlugin.contentUrl("https://eimir.invalid" + ROUTE));
        assertNotNull(PlanFilesPlugin.contentUrl("http://192.0.2.1:8080/self-hosted" + ROUTE));
    }

    @Test
    public void rejectsOtherRoutesAndEmbeddedCredentials() {
        assertNull(PlanFilesPlugin.contentUrl("file://" + ROUTE));
        assertNull(PlanFilesPlugin.contentUrl("https://user@eimir.invalid" + ROUTE));
        assertNull(PlanFilesPlugin.contentUrl("https://eimir.invalid" + ROUTE + "?variant=thumbnail"));
        assertNull(PlanFilesPlugin.contentUrl("https://eimir.invalid" + ROUTE + "/other"));
    }
}
