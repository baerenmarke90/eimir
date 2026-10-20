package de.eimir.app;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.BroadcastReceiver;
import android.os.Build;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.WebViewListener;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.unifiedpush.android.connector.UnifiedPush;

public class UnifiedPushAccountReplacementTest {
    private static final String PREVIOUS = "17b4a730-e98c-4af3-b19e-5fae9485200c";
    private static final String NEXT = "0f94bddd-bede-4676-a343-7202f117fef9";
    private static final String VAPID = "B" + new String(new char[86]).replace('\0', 'A');
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();
    private LauncherActivity activity;
    private UnifiedPushBridge plugin;
    private String distributor;
    private final LinkedBlockingQueue<Intent> requests = new LinkedBlockingQueue<>();
    private final CountDownLatch distributorStarted = new CountDownLatch(1);
    private final BroadcastReceiver observer = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if ("activated".equals(intent.getStringExtra("operation"))) distributorStarted.countDown();
            else requests.add(intent);
        }
    };
    private boolean observing;

    @Before
    public void prepare() throws Exception {
        distributor = instrumentation.getContext().getPackageName();
        IntentFilter observed = new IntentFilter(TestPushDistributor.OBSERVED);
        ContextCompat.registerReceiver(context, observer, observed, ContextCompat.RECEIVER_EXPORTED);
        observing = true;
        instrumentation.getContext().startActivity(new Intent()
            .setClassName(distributor, "de.eimir.app.TestPushDistributor$ActivationActivity")
            .putExtra("targetApplication", context.getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        assertTrue("The distributor has left its initial stopped state",
            distributorStarted.await(5, TimeUnit.SECONDS));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            instrumentation.getUiAutomation().grantRuntimePermission(
                context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        activity = (LauncherActivity) instrumentation.startActivitySync(
            new Intent(context, LauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        plugin = (UnifiedPushBridge) activity.getBridge().getPlugin("EimirUnifiedPush").getInstance();
        CountDownLatch blankDocumentLoaded = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> {
            WebView webView = activity.getBridge().getWebView();
            webView.stopLoading();
            webView.getSettings().setJavaScriptEnabled(false);
            activity.getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    if ("about:blank".equals(view.getUrl())) blankDocumentLoaded.countDown();
                }
            });
            webView.loadUrl("about:blank");
        });
        assertTrue("The old Web document has been replaced", blankDocumentLoaded.await(5, TimeUnit.SECONDS));
        CountDownLatch nativeCallsDrained = new CountDownLatch(1);
        activity.getBridge().execute(nativeCallsDrained::countDown);
        assertTrue("The previous Web document cannot issue more native lifecycle calls",
            nativeCallsDrained.await(5, TimeUnit.SECONDS));
        UnifiedPush.removeDistributor(context);
        requests.clear();
        assertTrue("The test APK is a discoverable local distributor",
            UnifiedPush.getDistributors(context).contains(distributor));
        UnifiedPush.saveDistributor(context, distributor);
        UnifiedPush.register(context, PREVIOUS, "eimir.", VAPID);
        assertNotNull("The initial Account sends a real connector registration", nextRegister());
        context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE).edit()
            .putString("active_account", PREVIOUS).commit();
    }

    @After
    public void cleanup() throws Exception {
        if (plugin != null) plugin.disable(new CapturedCall("disable", new JSObject()));
        UnifiedPush.unregister(context, PREVIOUS);
        UnifiedPush.unregister(context, NEXT);
        UnifiedPush.removeDistributor(context);
        requests.clear();
        if (observing) context.unregisterReceiver(observer);
        if (activity != null) instrumentation.runOnMainSync(activity::finish);
    }

    @Test
    public void replacingTheOnlyAccountSelectsADistributorAfterRetiringItsRegistration() throws Exception {
        CapturedCall enable = new CapturedCall("enable", configuration(NEXT));
        instrumentation.runOnMainSync(() -> plugin.enable(enable));
        assertNull(enable.error);
        assertTrue("Activation resolves after dispatching registration", enable.resolved);
        assertEquals("Replacing the last Account retains the newly selected distributor",
            distributor, UnifiedPush.getSavedDistributor(context));
        Intent registration = nextRegister();
        assertNotNull("The replacement Account sends a real REGISTER broadcast", registration);
        assertNotNull(registration.getStringExtra("token"));
        assertEquals(NEXT, context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE)
            .getString("active_account", null));
    }

    @Test
    public void aCancelledEnableCannotRetireTheCurrentAccount() throws Exception {
        CapturedCall cancelled = new CapturedCall("enable", configuration(NEXT));
        Field generation = UnifiedPushBridge.class.getDeclaredField("registrationRequests");
        generation.setAccessible(true);
        int obsoleteRequest = ((AtomicInteger) generation.get(plugin)).get();
        Method register = UnifiedPushBridge.class.getDeclaredMethod(
            "selectAndRegister", PluginCall.class, int.class);
        register.setAccessible(true);
        instrumentation.runOnMainSync(() -> {
            try {
                register.invoke(plugin, cancelled, obsoleteRequest);
            } catch (ReflectiveOperationException error) {
                throw new AssertionError(error);
            }
        });
        assertEquals("PUSH_REQUEST_CANCELLED", cancelled.error);
        assertEquals("Cancellation does not clear the active Account", PREVIOUS,
            context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE)
                .getString("active_account", null));
        assertEquals(distributor, UnifiedPush.getSavedDistributor(context));
        assertTrue("Cancellation emits no distributor operation", requests.isEmpty());
    }

    @Test
    public void aPermissionCallbackAfterDisableCannotReactivatePush() throws Exception {
        CapturedCall cancelled = new CapturedCall("enable", configuration(NEXT));
        plugin.disable(new CapturedCall("disable", new JSObject()));
        Method permissionResult = UnifiedPushBridge.class.getDeclaredMethod("permissionResult", PluginCall.class);
        permissionResult.setAccessible(true);
        instrumentation.runOnMainSync(() -> {
            try {
                permissionResult.invoke(plugin, cancelled);
            } catch (ReflectiveOperationException error) {
                throw new AssertionError(error);
            }
        });
        assertEquals("PUSH_REQUEST_CANCELLED", cancelled.error);
        assertNull(context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE)
            .getString("active_account", null));
        assertNull(UnifiedPush.getSavedDistributor(context));
        assertNull("Cancelled permission delivery sends no registration", nextRegister());
    }

    private static JSObject configuration(String accountId) {
        return new JSObject().put("accountId", accountId).put("vapidPublicKey", VAPID);
    }

    private Intent nextRegister() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            Intent request = requests.poll(
                Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
            if (request == null) return null;
            if ("org.unifiedpush.android.distributor.REGISTER".equals(request.getStringExtra("operation"))) return request;
        }
        return null;
    }

    private static final class CapturedCall extends PluginCall {
        boolean resolved;
        String error;

        CapturedCall(String method, JSObject data) {
            super(null, "EimirUnifiedPush", UUID.randomUUID().toString(), method, data);
        }

        @Override
        public void resolve() { resolved = true; }

        @Override
        public void resolve(JSObject data) { resolved = true; }

        @Override
        public void reject(String message, String code, Exception cause, JSObject data) {
            error = message;
        }
    }
}
