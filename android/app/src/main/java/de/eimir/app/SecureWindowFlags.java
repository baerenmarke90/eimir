package de.eimir.app;

import android.view.WindowManager;

/** Pure window-flag arithmetic for {@link SecureScreenPlugin}, testable on the JVM. */
final class SecureWindowFlags {
    private SecureWindowFlags() {}

    /** Returns {@code flags} with FLAG_SECURE set or cleared; other flags stay untouched. */
    static int apply(int flags, boolean secure) {
        return secure
            ? flags | WindowManager.LayoutParams.FLAG_SECURE
            : flags & ~WindowManager.LayoutParams.FLAG_SECURE;
    }

    static boolean isSecure(int flags) {
        return (flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
    }
}
