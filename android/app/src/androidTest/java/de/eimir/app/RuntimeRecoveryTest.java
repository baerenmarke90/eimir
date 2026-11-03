package de.eimir.app;

import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Assume;
import org.junit.Test;

/** Real renderer loss is isolated from the normal launcher suite's WebViews. */
public class RuntimeRecoveryTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private void ready(ActivityScenario<LauncherActivity> scenario) throws Exception {
        AtomicReference<LauncherActivity> owner = new AtomicReference<>();
        scenario.onActivity(owner::set);
        ready(owner.get());
    }

    private void ready(LauncherActivity activity) throws Exception {
        PackageInfo provider = WebView.getCurrentWebViewPackage();
        boolean legacyNativeFixture = Build.VERSION.SDK_INT == 28 && provider != null
            && provider.versionName != null && provider.versionName.startsWith("69.");
        if (!legacyNativeFixture) awaitBundledInterface(activity);
        // The stock API 28/Chromium 69 image cannot parse the existing Web bundle.
        // Preserve that lane's native adapter/frame assertions; it is not Web UI acceptance.
        CountDownLatch frame = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().postVisualStateCallback(
            1, new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) { frame.countDown(); }
            }));
        assertTrue("A live renderer must confirm a foreground frame", frame.await(15, TimeUnit.SECONDS));
    }

    private void awaitBundledInterface(LauncherActivity activity) throws Exception {
        CountDownLatch content = new CountDownLatch(1);
        AtomicBoolean observing = new AtomicBoolean(true);
        // DOM content can precede the login surface's finite entry animations.
        // Require visible content and completed finite motion before capturing.
        instrumentation.runOnMainSync(() -> {
            WebView view = activity.getBridge().getWebView();
            Runnable probe = new Runnable() {
                @Override public void run() {
                    if (!observing.get()) return;
                    view.evaluateJavascript(
                        "(()=>{const main=document.querySelector('#root main');"
                            + "if(!main||!main.innerText.trim())return false;"
                            + "const visible=element=>{const r=element.getBoundingClientRect();"
                            + "if(r.width<=0||r.height<=0||r.bottom<=0||r.right<=0"
                            + "||r.top>=innerHeight||r.left>=innerWidth)return false;"
                            + "for(let node=element;node;node=node.parentElement){const style=getComputedStyle(node);"
                            + "if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)<0.99)return false;}"
                            + "return true;};"
                            + "if(![...main.querySelectorAll('h1,h2,label,button,input')].some(visible))return false;"
                            + "return !main.getAnimations({subtree:true}).some(animation=>"
                            + "(animation.playState==='running'||animation.playState==='pending')"
                            + "&&Number.isFinite(animation.effect.getComputedTiming().endTime));})()",
                        value -> {
                            if (!observing.get()) return;
                            if ("true".equals(value)) content.countDown();
                            else view.postOnAnimation(this);
                        });
                }
            };
            probe.run();
        });
        try {
            assertTrue("The bundled app must render its interface, not remain on a blank launch document",
                content.await(15, TimeUnit.SECONDS));
        } finally {
            observing.set(false);
        }
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

    private void returnTask(LauncherActivity activity) {
        ActivityManager manager = (ActivityManager) instrumentation.getTargetContext()
            .getSystemService(Context.ACTIVITY_SERVICE);
        for (ActivityManager.AppTask task : manager.getAppTasks()) {
            if (task.getTaskInfo().id == activity.getTaskId()) {
                // Recents-style return without delivering another launch intent.
                task.moveToFront();
                return;
            }
        }
        fail("The existing app task must remain available");
    }

    private void backgroundTask(LauncherActivity activity) throws Exception {
        CountDownLatch stopped = new CountDownLatch(1);
        ActivityLifecycleCallback callback = (owner, stage) -> {
            if (owner == activity && stage == Stage.STOPPED) stopped.countDown();
        };
        instrumentation.runOnMainSync(() ->
            ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(callback));
        try {
            instrumentation.runOnMainSync(() -> assertTrue(activity.moveTaskToBack(true)));
            assertTrue("The actual task must reach the background", stopped.await(15, TimeUnit.SECONDS));
        } finally {
            instrumentation.runOnMainSync(() ->
                ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback));
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
        AtomicReference<WebView> originalView = new AtomicReference<>();
        AtomicReference<WebViewRenderProcess> process = new AtomicReference<>();
        AtomicInteger freshCreations = new AtomicInteger();
        CountDownLatch gone = new CountDownLatch(1);
        CountDownLatch recreated = new CountDownLatch(1);
        ActivityLifecycleCallback callback = (activity, stage) -> {
            if (stage == Stage.CREATED && activity instanceof LauncherActivity && activity != original.get()) {
                freshCreations.incrementAndGet();
            }
            if (stage == Stage.RESUMED && activity instanceof LauncherActivity && activity != original.get()) {
                returned.set((LauncherActivity) activity);
                recreated.countDown();
            }
        };
        try {
            // ActivityScenario matches action/data as well as the component. Recovery
            // intentionally replaces that intent, so observe the real task lifecycle.
            LauncherActivity activity = (LauncherActivity) instrumentation.startActivitySync(
                new Intent(instrumentation.getTargetContext(), LauncherActivity.class)
                    .setAction(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            original.set(activity);
            ready(activity);
            instrumentation.runOnMainSync(() -> {
                // A previously consumed launch link must not become a new cold-start intent.
                activity.setIntent(new Intent(activity.getIntent()).setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("de.eimir.app://recent-authentication/oidc?code=synthetic-consumed"))
                    .putExtra("synthetic-consumed", true));
                originalView.set(activity.getBridge().getWebView());
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
            backgroundTask(activity);
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
                returnTask(activity);
            }
            assertTrue("Foreground return must recreate the bridge", recreated.await(15, TimeUnit.SECONDS));
            assertNotSame(original.get(), returned.get());
            ready(returned.get());
            instrumentation.runOnMainSync(() -> {
                LauncherActivity fresh = returned.get();
                assertNotSame("Recreation must allocate a new WebView", originalView.get(), fresh.getBridge().getWebView());
                assertNotNull(fresh.getBridge().getPlugin("NativeSessionStorage"));
                assertNotNull(fresh.getBridge().getPlugin("EimirPush"));
                if (incomingIntent) {
                    assertEquals("de.eimir.app://notifications", fresh.getIntent().getDataString());
                    assertTrue(fresh.getIntent().getBooleanExtra("synthetic-new-intent", false));
                } else {
                    assertEquals(Intent.ACTION_MAIN, fresh.getIntent().getAction());
                    assertNull(fresh.getIntent().getData());
                }
                assertFalse(fresh.getIntent().hasExtra("synthetic-consumed"));
            });
            assertEquals("Return must allocate exactly one Activity", 1, freshCreations.get());
            assertEquals("Normal reclamation must not show the crash dialog", 0, recovery.getHits());
            capture("renderer-background-return.png");
        } finally {
            instrumentation.runOnMainSync(() -> {
                ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback);
                if (returned.get() != null && !returned.get().isDestroyed()) returned.get().finish();
                if (original.get() != null && !original.get().isDestroyed()) original.get().finish();
            });
            instrumentation.removeMonitor(recovery);
        }
    }

    @Test
    public void aBackgroundCrashDefersTheExplicitDialogUntilReturn() throws Exception {
        Instrumentation.ActivityMonitor recovery = instrumentation.addMonitor(
            RuntimeRecoveryActivity.class.getName(), null, false);
        AtomicReference<WebView> view = new AtomicReference<>();
        AtomicReference<LauncherActivity> owner = new AtomicReference<>();
        CountDownLatch gone = new CountDownLatch(1);
        try {
            LauncherActivity activity = (LauncherActivity) instrumentation.startActivitySync(
                new Intent(instrumentation.getTargetContext(), LauncherActivity.class)
                    .setAction(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            owner.set(activity);
            ready(activity);
            instrumentation.runOnMainSync(() -> {
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
            backgroundTask(activity);
            instrumentation.runOnMainSync(() -> view.get().loadUrl("chrome://crash"));
            assertTrue(gone.await(15, TimeUnit.SECONDS));
            assertEquals("Even a crash must not start a background Activity", 0, recovery.getHits());
            // The expected native dialog immediately finishes the old Activity;
            // RESUMED is a transition, not the stable state to await here.
            returnTask(owner.get());
            Activity dialog = recovery.waitForActivityWithTimeout(15_000);
            assertNotNull(dialog);
            onView(withText(R.string.runtime_recovery_title)).inRoot(isDialog()).check(matches(isDisplayed()));
            onView(withText(R.string.runtime_recovery_close)).inRoot(isDialog()).perform(click());
        } finally {
            instrumentation.runOnMainSync(() -> {
                if (owner.get() != null && !owner.get().isDestroyed()) owner.get().finish();
            });
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
