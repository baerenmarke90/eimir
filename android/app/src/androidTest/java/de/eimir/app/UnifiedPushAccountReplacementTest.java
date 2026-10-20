package de.eimir.app;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TestName;
import org.unifiedpush.android.connector.UnifiedPush;

public class UnifiedPushAccountReplacementTest {
    private static final String PREVIOUS = "17b4a730-e98c-4af3-b19e-5fae9485200c";
    private static final String NEXT = "0f94bddd-bede-4676-a343-7202f117fef9";
    private static final String VAPID = "B" + new String(new char[86]).replace('\0', 'A');
    @Rule public final TestName testName = new TestName();
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();
    private RecordingLauncherActivity activity;
    private ActivityScenario<LauncherActivity> scenario;
    private UnifiedPushBridge plugin;
    private String distributor;
    private String previousToken;

    @Before
    public void prepare() throws Exception {
        distributor = instrumentation.getContext().getPackageName();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            instrumentation.getUiAutomation().grantRuntimePermission(
                context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        scenario = ActivityScenario.launch(new Intent(context, LauncherActivity.class)
                .putExtra(RecordingLauncherActivity.RECORD_DISPATCH, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        scenario.onActivity(created -> activity = (RecordingLauncherActivity) created);
        plugin = (UnifiedPushBridge) activity.getBridge().getPlugin("EimirUnifiedPush").getInstance();
        assertTrue("The old Web document has been replaced", activity.awaitBlankDocument(5, TimeUnit.SECONDS));
        CountDownLatch nativeCallsDrained = new CountDownLatch(1);
        activity.getBridge().execute(nativeCallsDrained::countDown);
        assertTrue("The previous Web document cannot issue more native lifecycle calls",
            nativeCallsDrained.await(5, TimeUnit.SECONDS));

        // Observe the real connector's dispatch boundary. Android's background
        // queue can defer manifest delivery; this contract is not a delivery SLA.
        UnifiedPush.removeDistributor(activity);
        activity.clear();
        assertTrue("The test APK is a discoverable distributor",
            UnifiedPush.getDistributors(activity).contains(distributor));
        UnifiedPush.saveDistributor(activity, distributor);
        UnifiedPush.register(activity, PREVIOUS, "eimir.", VAPID);
        List<Intent> initial = activity.registrations();
        assertEquals("The initial Account dispatches exactly one real connector registration", 1, initial.size());
        previousToken = initial.get(0).getStringExtra("token");
        assertNotNull(previousToken);
        context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE).edit()
            .putString("active_account", PREVIOUS).commit();
        activity.clear();
        trace("prepared");
    }

    @After
    public void cleanup() throws Exception {
        try {
            if (plugin != null) plugin.disable(new CapturedCall("disable", new JSObject()));
            UnifiedPush.unregister(context, PREVIOUS);
            UnifiedPush.unregister(context, NEXT);
            UnifiedPush.removeDistributor(context);
        } finally {
            if (scenario != null) scenario.close();
        }
    }

    @Test
    public void replacingTheOnlyAccountSelectsADistributorAfterRetiringItsRegistration() throws Exception {
        CapturedCall enable = new CapturedCall("enable", configuration(NEXT));
        instrumentation.runOnMainSync(() -> plugin.enable(enable));
        assertNull(enable.error);
        assertTrue("Activation resolves after dispatching registration", enable.resolved);
        List<Intent> registrations = activity.registrations();
        trace("replacement dispatched");
        assertEquals("Replacing the last Account retains the newly selected distributor",
            distributor, UnifiedPush.getSavedDistributor(activity));
        assertEquals("The replacement Account dispatches exactly one real REGISTER", 1, registrations.size());
        Intent registration = registrations.get(0);
        assertEquals(distributor, registration.getPackage());
        assertNotNull(registration.getStringExtra("token"));
        assertFalse("The replacement uses a new registration",
            previousToken.equals(registration.getStringExtra("token")));
        assertEquals(NEXT, context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE)
            .getString("active_account", null));
    }

    @Test
    public void aCancelledEnableCannotRetireTheCurrentAccount() throws Exception {
        CapturedCall cancelled = new CapturedCall("enable", configuration(NEXT));
        Field generation = UnifiedPushBridge.class.getDeclaredField("registrationRequests");
        generation.setAccessible(true);
        int obsoleteRequest = ((AtomicInteger) generation.get(plugin)).get();
        Method register = UnifiedPushBridge.class.getDeclaredMethod("selectAndRegister", PluginCall.class, int.class);
        register.setAccessible(true);
        instrumentation.runOnMainSync(() -> invoke(register, cancelled, obsoleteRequest));
        assertEquals("PUSH_REQUEST_CANCELLED", cancelled.error);
        assertEquals("Cancellation does not clear the active Account", PREVIOUS,
            context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE)
                .getString("active_account", null));
        assertEquals(distributor, UnifiedPush.getSavedDistributor(activity));
        assertTrue("Cancellation emits no distributor operation", !activity.hasRequests());
        trace("obsolete enable rejected");
    }

    @Test
    public void aPermissionCallbackAfterDisableCannotReactivatePush() throws Exception {
        CapturedCall cancelled = new CapturedCall("enable", configuration(NEXT));
        plugin.disable(new CapturedCall("disable", new JSObject()));
        activity.clear();
        Method permissionResult = UnifiedPushBridge.class.getDeclaredMethod("permissionResult", PluginCall.class);
        permissionResult.setAccessible(true);
        instrumentation.runOnMainSync(() -> invoke(permissionResult, cancelled));
        assertEquals("PUSH_REQUEST_CANCELLED", cancelled.error);
        assertNull(context.getSharedPreferences("eimir_unified_push", Context.MODE_PRIVATE)
            .getString("active_account", null));
        assertNull(UnifiedPush.getSavedDistributor(activity));
        assertTrue("Cancelled permission delivery emits no distributor operation", !activity.hasRequests());
        trace("late permission rejected");
    }

    private void invoke(Method method, Object... arguments) {
        try {
            method.invoke(plugin, arguments);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(error);
        }
    }

    private static JSObject configuration(String accountId) {
        return new JSObject().put("accountId", accountId).put("vapidPublicKey", VAPID);
    }

    private void trace(String stage) {
        Log.i("EimirPushFixture", testName.getMethodName() + " " + stage
            + "; distributor=" + UnifiedPush.getSavedDistributor(activity)
            + "; registrations=" + activity.registrations().size());
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
        public void reject(String message, String code, Exception cause, JSObject data) { error = message; }
    }
}
