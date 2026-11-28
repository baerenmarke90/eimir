package de.eimir.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** Preview v4 (#2337) lets only a ServerAdmin notice wait up to an hour on the device. */
public class PushPreviewValidityTest {
    @Test public void onlyAV4OperatorNoticeGetsAnHour() {
        assertEquals(3600, PushPreview.validity("OPERATOR_ALERT", 4));
        assertEquals(300, PushPreview.validity("OPERATOR_ALERT", 3));
        assertEquals(300, PushPreview.validity("THINKING_OF_YOU", 4));
        assertEquals(300, PushPreview.validity("COMMENT_CREATED", 1));
    }
}
