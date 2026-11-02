package de.eimir.app;

import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;

import android.app.Activity;
import android.app.Instrumentation;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;

/** Exercise a real renderer crash separately from the normal launcher suite. */
public class RuntimeRecoveryTest {
    @Test
    public void rendererLossOffersExplicitRecoveryWithoutRestartingItself() {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor recovery = instrumentation.addMonitor(
            RuntimeRecoveryActivity.class.getName(), null, false);
        Instrumentation.ActivityMonitor launches = instrumentation.addMonitor(
            LauncherActivity.class.getName(), null, false);
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(LauncherActivity.class)) {
            Activity original = launches.waitForActivityWithTimeout(1_000);
            assertNotNull(original);
            int initialLaunches = launches.getHits();
            scenario.onActivity(activity -> activity.getBridge().getWebView().loadUrl("chrome://crash"));
            Activity recovered = recovery.waitForActivityWithTimeout(15_000);
            assertNotNull("Renderer loss must reach the native recovery surface", recovered);
            onView(withText(R.string.runtime_recovery_title)).check(matches(isDisplayed()));
            assertEquals("There must be no automatic restart loop", initialLaunches, launches.getHits());
            onView(withText(R.string.runtime_recovery_retry)).perform(click());
            Activity reopened = launches.waitForActivityWithTimeout(15_000);
            assertNotNull("An explicit retry opens a new bridge", reopened);
            assertNotSame(original, reopened);
            assertEquals(initialLaunches + 1, launches.getHits());
            instrumentation.runOnMainSync(() -> {
                assertNotNull(((LauncherActivity) reopened).getBridge().getWebView());
                reopened.finish();
            });
        } finally {
            instrumentation.removeMonitor(recovery);
            instrumentation.removeMonitor(launches);
        }
    }
}
