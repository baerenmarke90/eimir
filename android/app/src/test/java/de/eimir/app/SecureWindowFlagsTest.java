package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.view.WindowManager;
import org.junit.Test;

public class SecureWindowFlagsTest {
    private static final int SECURE = WindowManager.LayoutParams.FLAG_SECURE;
    private static final int OTHER = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS;

    @Test
    public void enablingSetsOnlyTheSecureFlag() {
        int flags = SecureWindowFlags.apply(OTHER, true);
        assertTrue(SecureWindowFlags.isSecure(flags));
        assertEquals(OTHER | SECURE, flags);
    }

    @Test
    public void disablingClearsOnlyTheSecureFlag() {
        int flags = SecureWindowFlags.apply(OTHER | SECURE, false);
        assertFalse(SecureWindowFlags.isSecure(flags));
        assertEquals(OTHER, flags);
    }

    @Test
    public void repeatedRequestsAreIdempotent() {
        assertEquals(OTHER | SECURE, SecureWindowFlags.apply(OTHER | SECURE, true));
        assertEquals(OTHER, SecureWindowFlags.apply(OTHER, false));
    }
}
