package de.eimir.app;

import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.webkit.WebViewRenderProcess;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Assume;
import org.junit.Test;

/** Real renderer loss is isolated from the normal launcher suite's WebViews. */
public class RuntimeRecoveryTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private void ready(ActivityScenario<LauncherActivity> scenario) throws Exception {
        CountDownLatch frame = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().postVisualStateCallback(
            1, new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) { frame.countDown(); }
            }));
        assertTrue("A live renderer must confirm a foreground frame", frame.await(15, TimeUnit.SECONDS));
    }

    private void capture(String name) throws Exception {
        Bitmap bitmap = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        try (FileOutputStream output = new FileOutputStream(
                new File(instrumentation.getTargetContext().getFilesDir(), name))) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output));
        } finally {
            bitmap.recycle();
        }
    }

    @Test
    public void healthyBackgroundReturnRetainsTheSameBridgeAndWebView() throws Exception {
        AtomicReference<WebView> original = new AtomicReference<>();
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(LauncherActivity.class)) {
            ready(scenario);
            scenario.onActivity(activity -> original.set(activity.getBridge().getWebView()));
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.RESUMED);
            ready(scenario);
            scenario.onActivity(activity -> assertSame(original.get(), activity.getBridge().getWebView()));
        }
    }

    @Test
    public void reclaimedBackgroundRendererWaitsForReturnAndCreatesOneFreshBridge() throws Exception {
        verifyBackgroundReclamation(false);
    }

    @Test
    public void aNewNotificationIntentSurvivesDeferredRendererRecovery() throws Exception {
        verifyBackgroundReclamation(true);
    }

    private void verifyBackgroundReclamation(boolean incomingIntent) throws Exception {
        // terminate() is the platform's non-crash termination API, added in Q.
        Assume.assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        Instrumentation.ActivityMonitor recovery = instrumentation.addMonitor(
            RuntimeRecoveryActivity.class.getName(), null, false);
        AtomicReference<LauncherActivity> original = new AtomicReference<>();
        AtomicReference<LauncherActivity> returned = new AtomicReference<>();
        AtomicReference<WebViewRenderProcess> process = new AtomicReference<>();
        CountDownLatch gone = new CountDownLatch(1);
        CountDownLatch recreated = new CountDownLatch(1);
        ActivityLifecycleCallback callback = (activity, stage) -> {
            if (stage == Stage.RESUMED && activity instanceof LauncherActivity && activity != original.get()) {
                returned.set((LauncherActivity) activity);
                recreated.countDown();
            }
        };
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(LauncherActivity.class)) {
            ready(scenario);
            scenario.onActivity(activity -> {
                original.set(activity);
                // A previously consumed launch link must not become a new cold-start intent.
                activity.setIntent(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("de.eimir.app://recent-authentication/oidc?code=synthetic-consumed"))
                    .putExtra("synthetic-consumed", true));
                process.set(activity.getBridge().getWebView().getWebViewRenderProcess());
                activity.getBridge().addWebViewListener(new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                        assertFalse("The platform kill must exercise reclamation, not chrome://crash", detail.didCrash());
                        assertNull("Dead bridge ownership must be cleared before later lifecycle events", activity.getBridge());
                        gone.countDown();
                        return true;
                    }
                });
                ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(callback);
            });
            assertNotNull(process.get());
            scenario.moveToState(Lifecycle.State.CREATED);
            instrumentation.runOnMainSync(() -> assertTrue(process.get().terminate()));
            assertTrue("A real non-crash exit must reach the handler", gone.await(15, TimeUnit.SECONDS));
            assertNull("Recovery must not start an Activity in the background", returned.get());
            assertEquals(0, recovery.getHits());
            if (incomingIntent) {
                instrumentation.getTargetContext().startActivity(new Intent(
                    instrumentation.getTargetContext(), LauncherActivity.class)
                    .setAction(Intent.ACTION_VIEW).setData(Uri.parse("de.eimir.app://notifications"))
                    .putExtra("synthetic-new-intent", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } else {
                scenario.moveToState(Lifecycle.State.RESUMED);
            }
            assertTrue("Foreground return must recreate the bridge", recreated.await(15, TimeUnit.SECONDS));
            assertNotSame(original.get(), returned.get());
            ready(scenario);
            scenario.onActivity(activity -> {
                assertSame(returned.get(), activity);
                assertNotNull(activity.getBridge().getPlugin("NativeSessionStorage"));
                assertNotNull(activity.getBridge().getPlugin("EimirPush"));
                if (incomingIntent) {
                    assertEquals("de.eimir.app://notifications", activity.getIntent().getDataString());
                    assertTrue(activity.getIntent().getBooleanExtra("synthetic-new-intent", false));
                } else {
                    assertEquals(Intent.ACTION_MAIN, activity.getIntent().getAction());
                    assertNull(activity.getIntent().getData());
                }
                assertFalse(activity.getIntent().hasExtra("synthetic-consumed"));
            });
            assertEquals("Normal reclamation must not show the crash dialog", 0, recovery.getHits());
            capture("renderer-background-return.png");
        } finally {
            instrumentation.runOnMainSync(() ->
                ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback));
            instrumentation.removeMonitor(recovery);
        }
    }

    @Test
    public void aBackgroundCrashDefersTheExplicitDialogUntilReturn() throws Exception {
        Instrumentation.ActivityMonitor recovery = instrumentation.addMonitor(
            RuntimeRecoveryActivity.class.getName(), null, false);
        AtomicReference<WebView> view = new AtomicReference<>();
        CountDownLatch gone = new CountDownLatch(1);
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(LauncherActivity.class)) {
            ready(scenario);
            scenario.onActivity(activity -> {
                view.set(activity.getBridge().getWebView());
                activity.getBridge().addWebViewListener(new WebViewListener() {
                    @Override
                    public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                        assertTrue(detail.didCrash());
                        gone.countDown();
                        return true;
                    }
                });
            });
            scenario.moveToState(Lifecycle.State.CREATED);
            instrumentation.runOnMainSync(() -> view.get().loadUrl("chrome://crash"));
            assertTrue(gone.await(15, TimeUnit.SECONDS));
            assertEquals("Even a crash must not start a background Activity", 0, recovery.getHits());
            scenario.moveToState(Lifecycle.State.RESUMED);
            Activity dialog = recovery.waitForActivityWithTimeout(15_000);
            assertNotNull(dialog);
            onView(withText(R.string.runtime_recovery_title)).inRoot(isDialog()).check(matches(isDisplayed()));
            onView(withText(R.string.runtime_recovery_close)).inRoot(isDialog()).perform(click());
        } finally {
            instrumentation.removeMonitor(recovery);
        }
    }

    @Test
    public void rendererLossOffersExplicitRecoveryWithoutRestartingItself() throws Exception {
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
            onView(withText(R.string.runtime_recovery_title)).inRoot(isDialog()).check(matches(isDisplayed()));
            capture("renderer-real-crash.png");
            assertEquals("There must be no automatic restart loop", initialLaunches, launches.getHits());
            onView(withText(R.string.runtime_recovery_retry)).inRoot(isDialog()).perform(click());
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
