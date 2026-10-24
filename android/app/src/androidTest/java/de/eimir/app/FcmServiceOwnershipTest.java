package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.TaskCompletionSource;
import com.google.android.gms.tasks.Tasks;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class FcmServiceOwnershipTest {
    private static final String ACCOUNT = "17b4a730-e98c-4af3-b19e-5fae9485200c";
    private static final String API = "https://push-fixture.eimir.invalid/api/v1";
    private static final String PREVIOUS_ACTIVATION = "0b023a34-8cf4-4cde-9c57-7f37fe8b0dd4";
    private static final String CURRENT_ACTIVATION = "17a5d357-c71e-4437-9b54-56ce84106980";
    private static final String PREVIOUS_FID = "c012345678901234567890";
    private static final String CURRENT_FID = "d012345678901234567890";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();
    private final ControlledOperations operations = new ControlledOperations();
    private Field queueInstance;
    private Object previousQueue;
    private ActivityScenario<LauncherActivity> scenario;

    @Before
    public void prepare() throws Exception {
        PushActivation.clear(context);
        PushActivation.cleanupPending(context, false);
        // This is our own application singleton, not an Android hidden field.
        queueInstance = FcmRegistrationQueue.class.getDeclaredField("instance");
        queueInstance.setAccessible(true);
        synchronized (FcmRegistrationQueue.class) {
            previousQueue = queueInstance.get(null);
            queueInstance.set(null, new FcmRegistrationQueue(context, operations));
        }
    }

    @After
    public void cleanup() throws Exception {
        try {
            if (scenario != null) scenario.close();
            PushActivation.clear(context);
            PushActivation.cleanupPending(context, false);
            NativePushNotifications.cancel(context);
            instrumentation.waitForIdleSync();
        } finally {
            if (queueInstance != null) {
                synchronized (FcmRegistrationQueue.class) {
                    queueInstance.set(null, previousQueue);
                }
            }
        }
    }

    @Test
    public void startupResumesPendingRetirementWithoutEnablingReceipt() throws Exception {
        TaskCompletionSource<Void> deletion = new TaskCompletionSource<>();
        operations.deletion = deletion.getTask();
        assertTrue(PushActivation.cleanupPending(context, true));

        startBridge();
        instrumentation.waitForIdleSync();
        assertEquals("Startup only resumes the previously authorized SDK retirement",
            Arrays.asList("disableAutoInit", "unregister", "deleteInstallation"), operations.calls);
        assertNull("Pending cleanup does not create a receipt owner", PushActivation.read(context));
        assertTrue("The marker remains pending until deletion actually completes", PushActivation.cleanupPending(context));
        assertEquals("An off startup never registers", 0, operations.registerCalls.get());
        assertEquals("An off startup never obtains an installation ID", 0, operations.identityCalls.get());

        deletion.setResult(null);
        instrumentation.waitForIdleSync();
        assertFalse("Successful retirement completes the durable cleanup request", PushActivation.cleanupPending(context));
        assertNull("Completing retirement leaves receipt disabled", PushActivation.read(context));
    }

    @Test
    public void startupInvalidatesAStaleFcmSnapshotBeforeDeletingItsInstallation() throws Exception {
        PushActivation stale = activation(PREVIOUS_ACTIVATION).withEndpoint(endpoint(PREVIOUS_FID, PREVIOUS_ACTIVATION));
        PushActivation.save(context, stale);
        Intent oldTap = NativePushNotifications.notificationIntent(context, stale);
        assertTrue(NativePushNotifications.matches(context, oldTap));
        assertTrue(PushActivation.cleanupPending(context, true));
        TaskCompletionSource<Void> deletion = new TaskCompletionSource<>();
        operations.deletion = deletion.getTask();
        AtomicBoolean ownerClearedBeforeDeletion = new AtomicBoolean();
        AtomicBoolean tapInvalidBeforeDeletion = new AtomicBoolean();
        operations.onDelete = () -> {
            ownerClearedBeforeDeletion.set(PushActivation.read(context) == null);
            tapInvalidBeforeDeletion.set(!NativePushNotifications.matches(context, oldTap));
        };

        startBridge();
        instrumentation.waitForIdleSync();
        assertTrue("The stale receipt owner is cleared before SDK deletion begins", ownerClearedBeforeDeletion.get());
        assertTrue("The stale tap is invalid before SDK deletion begins", tapInvalidBeforeDeletion.get());
        assertNull("A restored stale snapshot cannot reactivate receipt", PushActivation.read(context));
        assertTrue("Deletion has not completed yet", PushActivation.cleanupPending(context));
        assertEquals("The stale owner is retired without registering or obtaining an ID",
            Arrays.asList("disableAutoInit", "unregister", "deleteInstallation"), operations.calls);

        deletion.setResult(null);
        instrumentation.waitForIdleSync();
        assertFalse(PushActivation.cleanupPending(context));
        assertNull("Successful deletion cannot restore the retired consent", PushActivation.read(context));
        assertFalse("The retired notification remains invalid after cleanup", NativePushNotifications.matches(context, oldTap));
    }

    @Test
    public void failedStartupDeletionRemainsPendingUntilTheNextActivityStart() throws Exception {
        operations.deletionResults.add(Tasks.forException(new IllegalStateException("SYNTHETIC_DELETE_FAILURE")));
        TaskCompletionSource<Void> nextDeletion = new TaskCompletionSource<>();
        operations.deletionResults.add(nextDeletion.getTask());
        assertTrue(PushActivation.cleanupPending(context, true));

        startBridge();
        instrumentation.waitForIdleSync();
        assertTrue("A failed startup deletion retains its durable marker", PushActivation.cleanupPending(context));
        assertEquals("A startup failure does not enter an automatic retry loop",
            Arrays.asList("disableAutoInit", "unregister", "deleteInstallation"), operations.calls);
        scenario.close();
        scenario = null;
        synchronized (FcmRegistrationQueue.class) {
            // Restore the application queue from preferences, without its
            // previous in-memory retirementRequested state.
            queueInstance.set(null, new FcmRegistrationQueue(context, operations));
        }

        startBridge();
        instrumentation.waitForIdleSync();
        assertEquals("The next Activity start performs one fresh retirement attempt",
            Arrays.asList("disableAutoInit", "unregister", "deleteInstallation",
                "disableAutoInit", "unregister", "deleteInstallation"), operations.calls);
        assertTrue("The second request awaits its actual deletion result", PushActivation.cleanupPending(context));
        assertNull("A cleanup retry does not enable receipt", PushActivation.read(context));
        assertEquals(0, operations.registerCalls.get());
        assertEquals(0, operations.identityCalls.get());

        nextDeletion.setResult(null);
        instrumentation.waitForIdleSync();
        assertFalse("The later successful deletion completes the request", PushActivation.cleanupPending(context));
    }

    @Test
    public void startupWithoutPendingCleanupDoesNotCallTheSdk() throws Exception {
        startBridge();
        instrumentation.waitForIdleSync();
        assertTrue("An off startup without a prior cleanup request never touches the SDK", operations.calls.isEmpty());
        assertNull(PushActivation.read(context));
        assertFalse(PushActivation.cleanupPending(context));
    }

    @Test
    public void delayedRegisteredCallbackCannotReplaceTheCurrentActivationFid() throws Exception {
        PushActivation previous = activation(PREVIOUS_ACTIVATION).withEndpoint(endpoint(PREVIOUS_FID, PREVIOUS_ACTIVATION));
        PushActivation.save(context, previous);
        PushActivation.clear(context);
        PushActivation current = activation(CURRENT_ACTIVATION).withEndpoint(endpoint(CURRENT_FID, CURRENT_ACTIVATION));
        PushActivation.save(context, current);

        NativePushBridge.fcmRegistered(context, PREVIOUS_FID);
        instrumentation.waitForIdleSync();
        assertEquals("A callback checks the SDK's present installation", 1, operations.identityCalls.get());
        operations.identifier.setResult(CURRENT_FID);
        instrumentation.waitForIdleSync();

        PushActivation retained = PushActivation.read(context);
        assertNotNull(retained);
        assertTrue("A retired FID must not overwrite the new activation's registration",
            current.endpointValue.equals(retained.endpointValue));
        assertEquals("Identity verification never recursively registers with Firebase", 0, operations.registerCalls.get());
    }

    @Test
    public void delayedIdentityVerificationCannotOverwriteALaterActivation() throws Exception {
        PushActivation previous = activation(PREVIOUS_ACTIVATION).withEndpoint(endpoint(PREVIOUS_FID, PREVIOUS_ACTIVATION));
        PushActivation.save(context, previous);
        NativePushBridge.fcmRegistered(context, PREVIOUS_FID);
        instrumentation.waitForIdleSync();
        assertEquals(1, operations.identityCalls.get());

        PushActivation next = activation(CURRENT_ACTIVATION).withEndpoint(endpoint(CURRENT_FID, CURRENT_ACTIVATION));
        PushActivation.save(context, next);
        operations.identifier.setResult(PREVIOUS_FID);
        instrumentation.waitForIdleSync();
        PushActivation retained = PushActivation.read(context);
        assertNotNull(retained);
        assertTrue("The installation-ID result retains its captured activation scope",
            next.endpointValue.equals(retained.endpointValue));
        assertTrue("The newer activation remains the receipt owner", PushActivation.current(context, next));
    }

    @Test
    public void registeredServiceCallbackRestoresAPendingActivationWithoutAnActivity() throws Exception {
        PushActivation pending = activation(CURRENT_ACTIVATION);
        PushActivation.save(context, pending);
        NativePushBridge.fcmRegistered(context, CURRENT_FID);
        instrumentation.waitForIdleSync();
        assertEquals("The service verifies the restored installation with the SDK", 1, operations.identityCalls.get());
        operations.identifier.setResult(CURRENT_FID);
        instrumentation.waitForIdleSync();

        PushActivation restored = PushActivation.read(context);
        assertNotNull("The pending activation remains available without an Activity", restored);
        assertNotNull("The verified service callback persists its endpoint", restored.endpointValue);
        JSONObject endpoint = new JSONObject(restored.endpointValue);
        assertTrue("The persisted endpoint uses the current SDK installation",
            CURRENT_FID.equals(endpoint.getString("fid")));
        assertTrue("Service restoration preserves the original activation binding",
            PushActivation.current(context, pending)
                && CURRENT_ACTIVATION.equals(endpoint.getString("activationId")));
        assertEquals("The callback does not recursively register with Firebase", 0, operations.registerCalls.get());
    }

    @Test
    public void initialRegistrationIsSavedAfterItsActivityIsDestroyed() throws Exception {
        TaskCompletionSource<Void> registration = new TaskCompletionSource<>();
        operations.registration = registration.getTask();
        operations.identifier.setResult(CURRENT_FID);
        NativePushBridge plugin = startBridge();
        PushActivation pending = activation(CURRENT_ACTIVATION);
        PushActivation.save(context, pending);
        CapturedCall call = new CapturedCall();
        startRegistration(plugin, call, pending);
        instrumentation.waitForIdleSync();
        assertEquals("The SDK operation is genuinely pending before destruction", 1, operations.registerCalls.get());

        scenario.close();
        scenario = null;
        registration.setResult(null);
        call.await();
        assertFalse("A destroyed Activity's obsolete enable call cannot resolve", call.resolved);
        assertTrue("The obsolete call retains its cancellation outcome", "PUSH_REQUEST_CANCELLED".equals(call.error));
        PushActivation restored = PushActivation.read(context);
        assertNotNull("Receipt ownership survives Activity resource teardown", restored);
        JSONObject endpoint = new JSONObject(restored.endpointValue);
        assertTrue("Successful application-scoped registration remains available to the next bridge",
            CURRENT_FID.equals(endpoint.getString("fid")));
        assertTrue("The registration retains its original activation binding",
            CURRENT_ACTIVATION.equals(endpoint.getString("activationId")));
        assertTrue("Restoration retains the original pending activation", PushActivation.current(context, pending));
    }

    @Test
    public void obsoleteRegistrationFailureCannotRetireANewerRequestForTheSameActivation() throws Exception {
        TaskCompletionSource<Void> previousRegistration = new TaskCompletionSource<>();
        operations.registrationResults.add(previousRegistration.getTask());
        operations.registrationResults.add(Tasks.forResult(null));
        operations.identifier.setResult(CURRENT_FID);
        NativePushBridge plugin = startBridge();
        PushActivation pending = activation(CURRENT_ACTIVATION);
        PushActivation.save(context, pending);
        CapturedCall previous = new CapturedCall();
        CapturedCall replacement = new CapturedCall();
        startRegistration(plugin, previous, pending);
        instrumentation.waitForIdleSync();
        assertEquals(1, operations.registerCalls.get());

        startRegistration(plugin, replacement, pending);
        previousRegistration.setException(new IllegalStateException("SYNTHETIC_OBSOLETE_FAILURE"));
        previous.await();
        replacement.await();
        assertTrue("The superseded SDK failure is cancelled without retiring its successor",
            "PUSH_REQUEST_CANCELLED".equals(previous.error));
        assertTrue("The latest explicit registration can complete", replacement.resolved);
        assertEquals("The later registration receives its own SDK attempt", 2, operations.registerCalls.get());
        PushActivation current = PushActivation.read(context);
        assertNotNull("An obsolete failure does not clear current ownership", current);
        assertTrue("The same activation remains current", PushActivation.current(context, pending));
        assertTrue("The current successful SDK result remains available",
            CURRENT_FID.equals(new JSONObject(current.endpointValue).getString("fid")));
    }

    private NativePushBridge startBridge() throws Exception {
        scenario = ActivityScenario.launch(new Intent(context, LauncherActivity.class)
            .putExtra(RecordingLauncherActivity.RECORD_DISPATCH, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        RecordingLauncherActivity[] launched = new RecordingLauncherActivity[1];
        scenario.onActivity(activity -> launched[0] = (RecordingLauncherActivity) activity);
        RecordingLauncherActivity activity = launched[0];
        assertTrue("The old Web document has been replaced", activity.awaitBlankDocument(5, TimeUnit.SECONDS));
        CountDownLatch drained = new CountDownLatch(1);
        activity.getBridge().execute(drained::countDown);
        assertTrue("The previous document's native calls have drained", drained.await(5, TimeUnit.SECONDS));
        return (NativePushBridge) activity.getBridge().getPlugin("EimirPush").getInstance();
    }

    private void startRegistration(NativePushBridge plugin, CapturedCall call, PushActivation activation) throws Exception {
        Field generation = NativePushBridge.class.getDeclaredField("registrationRequests");
        generation.setAccessible(true);
        int request = ((AtomicInteger) generation.get(plugin)).get();
        Method register = NativePushBridge.class.getDeclaredMethod("registerFcm",
            PluginCall.class, int.class, PushActivation.class, boolean.class);
        register.setAccessible(true);
        instrumentation.runOnMainSync(() -> invoke(register, plugin, call, request, activation, true));
    }

    private static PushActivation activation(String id) {
        return new PushActivation(ACCOUNT, API, "fcm", id, null);
    }

    private static String endpoint(String fid, String activation) {
        return "{\"fid\":\"" + fid + "\",\"activationId\":\"" + activation + "\"}";
    }

    private static void invoke(Method method, Object target, Object... arguments) {
        try {
            method.invoke(target, arguments);
        } catch (ReflectiveOperationException failed) {
            throw new AssertionError(failed);
        }
    }

    private static final class ControlledOperations implements FcmRegistrationQueue.Operations {
        final List<String> calls = Collections.synchronizedList(new ArrayList<>());
        final AtomicInteger registerCalls = new AtomicInteger();
        final AtomicInteger identityCalls = new AtomicInteger();
        final TaskCompletionSource<String> identifier = new TaskCompletionSource<>();
        final Deque<Task<Void>> registrationResults = new ArrayDeque<>();
        final Deque<Task<Void>> deletionResults = new ArrayDeque<>();
        Task<Void> registration = Tasks.forResult(null);
        Task<Void> deletion = Tasks.forResult(null);
        Runnable onDelete;

        @Override public void disableAutoInit() { calls.add("disableAutoInit"); }
        @Override public Task<Void> register() {
            calls.add("register");
            registerCalls.incrementAndGet();
            Task<Void> next = registrationResults.pollFirst();
            return next == null ? registration : next;
        }
        @Override public Task<Void> unregister() { calls.add("unregister"); return Tasks.forResult(null); }
        @Override public Task<Void> deleteInstallation() {
            calls.add("deleteInstallation");
            if (onDelete != null) onDelete.run();
            Task<Void> next = deletionResults.pollFirst();
            return next == null ? deletion : next;
        }
        @Override public Task<String> installationId() {
            calls.add("installationId");
            identityCalls.incrementAndGet();
            return identifier.getTask();
        }
    }

    private static final class CapturedCall extends PluginCall {
        private final CountDownLatch completed = new CountDownLatch(1);
        volatile boolean resolved;
        volatile String error;

        CapturedCall() {
            super(null, "EimirPush", UUID.randomUUID().toString(), "enable", new JSObject());
        }

        @Override public void resolve() { resolved = true; completed.countDown(); }
        @Override public void resolve(JSObject value) { resolved = true; completed.countDown(); }
        @Override public void reject(String message, String code, Exception cause, JSObject value) {
            error = message;
            completed.countDown();
        }

        void await() throws InterruptedException {
            assertTrue("The controlled SDK operation completes the bridge call", completed.await(5, TimeUnit.SECONDS));
        }
    }
}
