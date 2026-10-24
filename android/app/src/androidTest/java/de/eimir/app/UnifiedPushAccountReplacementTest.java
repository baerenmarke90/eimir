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
import com.google.firebase.FirebaseApp;
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
    private NativePushBridge plugin;
    private String distributor;
    private String previousToken;
    private PushActivation previousActivation;
    private static final String API = "https://example.invalid";

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
        plugin = (NativePushBridge) activity.getBridge().getPlugin("EimirPush").getInstance();
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
        previousActivation = new PushActivation(PREVIOUS, API, "unifiedpush", UUID.randomUUID().toString(), null);
        UnifiedPush.register(activity, previousActivation.activationId, "eimir.", VAPID);
        List<Intent> initial = activity.registrations();
        assertEquals("The initial Account dispatches exactly one real connector registration", 1, initial.size());
        previousToken = initial.get(0).getStringExtra("token");
        assertNotNull(previousToken);
        PushActivation.save(context, previousActivation);
        activity.clear();
        trace("prepared");
    }

    @After
    public void cleanup() throws Exception {
        try {
            if (plugin != null) {
                CapturedCall disable = new CapturedCall("disable", new JSObject());
                plugin.disable(disable);
                disable.await();
            }
            if (previousActivation != null) UnifiedPush.unregister(context, previousActivation.activationId);
            UnifiedPush.removeDistributor(context);
        } finally {
            if (scenario != null) scenario.close();
        }
    }

    @Test
    public void replacingTheOnlyAccountSelectsADistributorAfterRetiringItsRegistration() throws Exception {
        CapturedCall enable = new CapturedCall("enable", configuration(NEXT));
        instrumentation.runOnMainSync(() -> plugin.enable(enable));
        enable.await();
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
        PushActivation replacement = PushActivation.read(context);
        assertEquals(NEXT, replacement.accountId);
        assertEquals(API, replacement.apiBaseUrl);
        assertEquals("unifiedpush", replacement.providerKey);
        assertFalse("The new Account receives a separate activation", previousActivation.activationId.equals(replacement.activationId));
    }

    @Test
    public void aCancelledEnableCannotRetireTheCurrentAccount() throws Exception {
        CapturedCall cancelled = new CapturedCall("enable", configuration(NEXT));
        Field generation = NativePushBridge.class.getDeclaredField("registrationRequests");
        generation.setAccessible(true);
        int obsoleteRequest = ((AtomicInteger) generation.get(plugin)).get();
        Method register = NativePushBridge.class.getDeclaredMethod("selectAndRegister", PluginCall.class, int.class);
        register.setAccessible(true);
        instrumentation.runOnMainSync(() -> invoke(register, cancelled, obsoleteRequest));
        assertEquals("PUSH_REQUEST_CANCELLED", cancelled.error);
        assertEquals("Cancellation does not clear the active Account", PREVIOUS, PushActivation.read(context).accountId);
        assertEquals(distributor, UnifiedPush.getSavedDistributor(activity));
        assertTrue("Cancellation emits no distributor operation", !activity.hasRequests());
        trace("obsolete enable rejected");
    }

    @Test
    public void aPermissionCallbackAfterDisableCannotReactivatePush() throws Exception {
        CapturedCall cancelled = new CapturedCall("enable", configuration(NEXT));
        CapturedCall disable = new CapturedCall("disable", new JSObject());
        plugin.disable(disable);
        disable.await();
        activity.clear();
        Method permissionResult = NativePushBridge.class.getDeclaredMethod("permissionResult", PluginCall.class);
        permissionResult.setAccessible(true);
        instrumentation.runOnMainSync(() -> invoke(permissionResult, cancelled));
        assertEquals("PUSH_REQUEST_CANCELLED", cancelled.error);
        assertNull(PushActivation.read(context));
        assertNull(UnifiedPush.getSavedDistributor(activity));
        assertTrue("Cancelled permission delivery emits no distributor operation", !activity.hasRequests());
        CapturedCall status = new CapturedCall("status", new JSObject());
        plugin.status(status);
        assertNotNull(status.data);
        assertEquals("Status exposes the compiled package for server configuration matching",
            context.getPackageName(), status.data.getString("androidPackage"));
        String configuredProject = null;
        try { configuredProject = FirebaseApp.getInstance().getOptions().getProjectId(); }
        catch (IllegalStateException unconfigured) { }
        assertTrue("Unconfigured Firebase metadata is explicitly nullable", status.data.has("firebaseProjectId"));
        assertEquals("Status uses only the existing Firebase options",
            configuredProject, status.data.isNull("firebaseProjectId") ? null : status.data.getString("firebaseProjectId"));
        for (String field : new String[] { "accountId", "apiBaseUrl", "providerKey", "activationId" }) {
            assertTrue("Disabled status retains explicit nullable ownership fields",
                status.data.has(field) && status.data.isNull(field));
        }
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
        return new JSObject().put("accountId", accountId).put("apiBaseUrl", API)
            .put("providerKey", "unifiedpush").put("vapidPublicKey", VAPID);
    }

    private void trace(String stage) {
        Log.i("EimirPushFixture", testName.getMethodName() + " " + stage
            + "; distributor=" + UnifiedPush.getSavedDistributor(activity)
            + "; registrations=" + activity.registrations().size());
    }

    private static final class CapturedCall extends PluginCall {
        boolean resolved;
        String error;
        JSObject data;
        private final CountDownLatch completed = new CountDownLatch(1);

        void await() throws InterruptedException {
            assertTrue("The native lifecycle operation completes", completed.await(5, TimeUnit.SECONDS));
        }

        CapturedCall(String method, JSObject data) {
            super(null, "EimirPush", UUID.randomUUID().toString(), method, data);
        }

        @Override
        public void resolve() { resolved = true; completed.countDown(); }

        @Override
        public void resolve(JSObject data) { this.data = data; resolved = true; completed.countDown(); }

        @Override
        public void reject(String message, String code, Exception cause, JSObject data) { error = message; completed.countDown(); }
    }
}
