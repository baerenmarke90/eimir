package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class PushStorageFailureTest {
    private static final String FID = "d012345678901234567890";
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Context failing = new FailedCommitContext(context);
    private final RetirementOperations operations = new RetirementOperations();
    private Field queueInstance;
    private Object previousQueue;
    private FcmRegistrationQueue queue;

    @Before
    public void prepare() throws Exception {
        PushActivation.clear(context);
        PushActivation.cleanupPending(context, false);
        queue = new FcmRegistrationQueue(failing, operations);
        queueInstance = FcmRegistrationQueue.class.getDeclaredField("instance");
        queueInstance.setAccessible(true);
        synchronized (FcmRegistrationQueue.class) {
            previousQueue = queueInstance.get(null);
            queueInstance.set(null, queue);
        }
    }

    @After
    public void cleanup() throws Exception {
        try {
            PushActivation.clear(context);
            PushActivation.cleanupPending(context, false);
            NativePushNotifications.cancel(context);
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        } finally {
            if (queueInstance != null) {
                synchronized (FcmRegistrationQueue.class) {
                    queueInstance.set(null, previousQueue);
                }
            }
        }
    }

    @Test
    public void failedCleanupMarkerCommitDoesNotSkipProviderRetirement() throws Exception {
        try {
            Tasks.await(queue.retire(), 5, TimeUnit.SECONDS);
            fail("Failed cleanup persistence must not report a successful local commit");
        } catch (ExecutionException failed) {
            assertTrue("Storage failure remains a bounded technical outcome",
                "PUSH_STORAGE_UNAVAILABLE".equals(failed.getCause().getMessage()));
        }
        assertEquals("Provider retirement still executes despite marker persistence failure",
            Arrays.asList("unregister", "deleteInstallation"), operations.calls);
    }

    @Test
    public void endpointStorageFailureInvalidatesLocalReceiptWithoutEscapingCallback() {
        String activationId = "17a5d357-c71e-4437-9b54-56ce84106980";
        PushActivation active = new PushActivation("17b4a730-e98c-4af3-b19e-5fae9485200c",
            "https://push-fixture.eimir.invalid/api/v1", "fcm", activationId,
            "{\"fid\":\"" + FID + "\",\"activationId\":\"" + activationId + "\"}");
        PushActivation.save(context, active);
        Intent oldTap = NativePushNotifications.notificationIntent(context, active);

        // This SDK callback persists an unavailable endpoint. A failed write
        // must be contained by the callback and invalidate its local owner.
        NativePushBridge.fcmUnregistered(failing, FID);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        assertNull("A storage error cannot leave an active local receipt owner", PushActivation.read(context));
        assertFalse("An old notification tap is no longer authorized after the failed write",
            NativePushNotifications.matches(context, oldTap));
        assertEquals("Failed endpoint persistence still retires the provider resource",
            Arrays.asList("unregister", "deleteInstallation"), operations.calls);
    }

    /** Match Android's memory-first edit while making every disk commit report failure. */
    private static final class FailedCommitContext extends ContextWrapper {
        FailedCommitContext(Context context) { super(context); }

        @Override public Context getApplicationContext() { return this; }

        @Override
        public SharedPreferences getSharedPreferences(String name, int mode) {
            SharedPreferences delegate = super.getSharedPreferences(name, mode);
            return (SharedPreferences) Proxy.newProxyInstance(getClass().getClassLoader(),
                new Class<?>[] { SharedPreferences.class }, (proxy, method, arguments) -> {
                    Object result = method.invoke(delegate, arguments);
                    if (!"edit".equals(method.getName())) return result;
                    SharedPreferences.Editor editor = (SharedPreferences.Editor) result;
                    return Proxy.newProxyInstance(getClass().getClassLoader(),
                        new Class<?>[] { SharedPreferences.Editor.class }, (editProxy, editMethod, editArguments) -> {
                            Object editResult = editMethod.invoke(editor, editArguments);
                            if ("commit".equals(editMethod.getName())) return false;
                            return editResult instanceof SharedPreferences.Editor ? editProxy : editResult;
                        });
                });
        }
    }

    private static final class RetirementOperations implements FcmRegistrationQueue.Operations {
        final List<String> calls = Collections.synchronizedList(new ArrayList<>());
        @Override public void disableAutoInit() { }
        @Override public Task<Void> register() { throw new AssertionError("Retirement must not register with Firebase"); }
        @Override public Task<Void> unregister() { calls.add("unregister"); return Tasks.forResult(null); }
        @Override public Task<Void> deleteInstallation() { calls.add("deleteInstallation"); return Tasks.forResult(null); }
        @Override public Task<String> installationId() { throw new AssertionError("Retirement must not generate a Firebase ID"); }
    }
}
