package de.eimir.app;

import static org.junit.Assert.*;

import android.os.SystemClock;
import android.view.WindowManager;
import androidx.test.core.app.ActivityScenario;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Assume;
import org.junit.Test;

/**
 * The Web layer's SecureScreen bridge call really sets and clears FLAG_SECURE
 * on the app window (#683, once messages), and a recreated Activity starts
 * without it, so only the Web layer's fresh request protects the new window.
 */
public class SecureScreenTest {
    private static final String REQUEST =
        "window.Capacitor && Capacitor.Plugins.SecureScreen.setSecure({ secure: %s })";

    @Test
    public void bridgeCallTogglesTheWindowFlagAndRecreationStartsUnprotected() {
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(LauncherActivity.class)) {
            // Below the WebView floor (the API 28 lane) only the static update
            // notice loads (#1931): no Web layer exists to request protection
            // and nothing private can render.
            AtomicBoolean supported = new AtomicBoolean();
            scenario.onActivity(activity -> supported.set(activity.getBridge().isMinimumWebViewInstalled()));
            Assume.assumeTrue(supported.get());
            assertFalse("No private surface is open at launch", secure(scenario));
            request(scenario, true);
            assertTrue("The bridge request must protect the window", secure(scenario));
            request(scenario, false);
            assertFalse("Leaving the private surface must release the window", secure(scenario));

            request(scenario, true);
            scenario.recreate();
            assertFalse("A recreated window waits for the Web layer's new request", secure(scenario));
        }
    }

    /** Repeats the request until the bridge has loaded and the window shows the state. */
    private static void request(ActivityScenario<LauncherActivity> scenario, boolean secure) {
        long deadline = SystemClock.uptimeMillis() + 20_000;
        while (SystemClock.uptimeMillis() < deadline) {
            scenario.onActivity(activity -> activity.getBridge().getWebView()
                .evaluateJavascript(String.format(REQUEST, secure), null));
            SystemClock.sleep(250);
            if (secure(scenario) == secure) return;
        }
        fail("SecureScreen did not reach secure=" + secure);
    }

    private static boolean secure(ActivityScenario<LauncherActivity> scenario) {
        AtomicBoolean secure = new AtomicBoolean();
        scenario.onActivity(activity -> secure.set(
            (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0));
        return secure.get();
    }
}
