package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.app.Instrumentation;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.TaskCompletionSource;
import com.google.android.gms.tasks.Tasks;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class FcmRegistrationQueueTest {
    private static final String FID = "synthetic-fixture-fid";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();

    @Before
    public void prepare() {
        PushActivation.cleanupPending(context, false);
    }

    @After
    public void cleanup() {
        PushActivation.cleanupPending(context, false);
    }

    @Test
    public void retirementCompletesBeforeANewActivationRegisters() throws Exception {
        FakeOperations operations = new FakeOperations();
        TaskCompletionSource<Void> oldRegistration = new TaskCompletionSource<>();
        TaskCompletionSource<Void> unregistered = new TaskCompletionSource<>();
        TaskCompletionSource<Void> deleted = new TaskCompletionSource<>();
        operations.registrations.add(oldRegistration.getTask());
        operations.unregistrations.add(unregistered.getTask());
        operations.deletions.add(deleted.getTask());
        FcmRegistrationQueue queue = new FcmRegistrationQueue(context, operations);
        AtomicBoolean previousCurrent = new AtomicBoolean(true);
        Task<String> previous = queue.register(previousCurrent::get);
        drainMainQueue();
        assertEquals(Arrays.asList("register"), operations.networkCalls());

        previousCurrent.set(false);
        Task<Void> retirement = queue.retire();
        Task<String> replacement = queue.register(() -> true);
        drainMainQueue();
        assertTrue("Retirement is durably pending before the SDK completes",
            PushActivation.cleanupPending(context));
        assertEquals("Unregistration cannot overtake an in-flight registration",
            Arrays.asList("register"), operations.networkCalls());

        oldRegistration.setResult(null);
        assertCancelled(previous);
        drainMainQueue();
        assertEquals("A cancelled activation does not obtain a FID",
            Arrays.asList("register", "unregister"), operations.networkCalls());
        assertFalse("Retirement awaits its actual SDK completion", retirement.isComplete());

        unregistered.setResult(null);
        drainMainQueue();
        assertEquals(Arrays.asList("register", "unregister", "deleteInstallation"),
            operations.networkCalls());
        assertFalse("New registration waits for installation deletion", replacement.isComplete());

        deleted.setResult(null);
        await(retirement);
        assertTrue("The replacement receives its own checked SDK result", FID.equals(await(replacement)));
        assertEquals(Arrays.asList("register", "unregister", "deleteInstallation", "register", "installationId"),
            operations.networkCalls());
        assertFalse("Completed SDK retirement clears its local pending marker",
            PushActivation.cleanupPending(context));
    }

    @Test
    public void cancelledActivationDoesNotCallTheSdk() throws Exception {
        FakeOperations operations = new FakeOperations();
        FcmRegistrationQueue queue = new FcmRegistrationQueue(context, operations);
        assertCancelled(queue.register(() -> false));
        assertTrue("An already cancelled request never initializes or registers with Firebase",
            operations.calls.isEmpty());
    }

    @Test
    public void lateInstallationIdCannotCompleteACancelledActivation() throws Exception {
        FakeOperations operations = new FakeOperations();
        TaskCompletionSource<String> identifier = new TaskCompletionSource<>();
        operations.identifiers.add(identifier.getTask());
        FcmRegistrationQueue queue = new FcmRegistrationQueue(context, operations);
        AtomicBoolean current = new AtomicBoolean(true);
        Task<String> registration = queue.register(current::get);
        drainMainQueue();
        assertEquals(Arrays.asList("register", "installationId"), operations.networkCalls());

        current.set(false);
        identifier.setResult(FID);
        assertCancelled(registration);
        assertEquals("A late FID result cannot trigger another SDK operation",
            Arrays.asList("register", "installationId"), operations.networkCalls());
    }

    @Test
    public void unregisterFailureStillRequestsInstallationDeletion() throws Exception {
        FakeOperations operations = new FakeOperations();
        operations.unregistrations.add(Tasks.forException(new IllegalStateException("SYNTHETIC_UNREGISTER_FAILURE")));
        FcmRegistrationQueue queue = new FcmRegistrationQueue(context, operations);
        await(queue.retire());
        assertEquals("Installation deletion is still attempted after an unregister error",
            Arrays.asList("unregister", "deleteInstallation"), operations.networkCalls());
        assertFalse("Successful deletion completes local SDK retirement",
            PushActivation.cleanupPending(context));
    }

    @Test
    public void failedDeletionRemainsPendingAcrossQueueRestorationBeforeRegister() throws Exception {
        FakeOperations failed = new FakeOperations();
        failed.deletions.add(Tasks.forException(new IllegalStateException("SYNTHETIC_DELETE_FAILURE")));
        assertFailed(new FcmRegistrationQueue(context, failed).retire());
        assertTrue("Failed provider cleanup retains its durable marker", PushActivation.cleanupPending(context));

        FakeOperations restored = new FakeOperations();
        TaskCompletionSource<Void> deleted = new TaskCompletionSource<>();
        restored.deletions.add(deleted.getTask());
        Task<String> replacement = new FcmRegistrationQueue(context, restored).register(() -> true);
        drainMainQueue();
        assertEquals("A restored queue retires the previous resource before creating another",
            Arrays.asList("unregister", "deleteInstallation"), restored.networkCalls());
        assertFalse("No FID is obtained while previous deletion remains pending", replacement.isComplete());

        deleted.setResult(null);
        assertTrue("A fresh activation can proceed after explicit pending cleanup", FID.equals(await(replacement)));
        assertEquals(Arrays.asList("unregister", "deleteInstallation", "register", "installationId"),
            restored.networkCalls());
        assertFalse(PushActivation.cleanupPending(context));
    }

    private void drainMainQueue() {
        instrumentation.waitForIdleSync();
    }

    private static <T> T await(Task<T> task) throws Exception {
        return Tasks.await(task, 5, TimeUnit.SECONDS);
    }

    private static void assertCancelled(Task<?> task) throws Exception {
        try {
            await(task);
            fail("A cancelled activation must not return a Firebase registration");
        } catch (ExecutionException cancelled) {
            assertTrue("Cancellation retains its bounded technical reason",
                "PUSH_REQUEST_CANCELLED".equals(cancelled.getCause().getMessage()));
        }
    }

    private static void assertFailed(Task<?> task) throws Exception {
        try {
            await(task);
            fail("A failed installation deletion must not report successful retirement");
        } catch (ExecutionException failed) {
            assertTrue("The failed operation retains its failure",
                "SYNTHETIC_DELETE_FAILURE".equals(failed.getCause().getMessage()));
        }
    }

    private static final class FakeOperations implements FcmRegistrationQueue.Operations {
        final List<String> calls = Collections.synchronizedList(new ArrayList<>());
        final Deque<Task<Void>> registrations = new ArrayDeque<>();
        final Deque<Task<Void>> unregistrations = new ArrayDeque<>();
        final Deque<Task<Void>> deletions = new ArrayDeque<>();
        final Deque<Task<String>> identifiers = new ArrayDeque<>();
        boolean autoInitDisabled;

        @Override
        public void disableAutoInit() {
            autoInitDisabled = true;
            calls.add("disableAutoInit");
        }

        @Override
        public Task<Void> register() {
            record("register");
            return next(registrations, null);
        }

        @Override
        public Task<Void> unregister() {
            record("unregister");
            return next(unregistrations, null);
        }

        @Override
        public Task<Void> deleteInstallation() {
            record("deleteInstallation");
            return next(deletions, null);
        }

        @Override
        public Task<String> installationId() {
            record("installationId");
            return next(identifiers, FID);
        }

        List<String> networkCalls() {
            List<String> result = new ArrayList<>();
            synchronized (calls) {
                for (String call : calls) if (!"disableAutoInit".equals(call)) result.add(call);
            }
            return result;
        }

        private void record(String operation) {
            if (!autoInitDisabled) throw new IllegalStateException("AUTO_INIT_NOT_DISABLED");
            calls.add(operation);
        }

        private static <T> Task<T> next(Deque<Task<T>> results, T fallback) {
            Task<T> result = results.pollFirst();
            return result == null ? Tasks.forResult(fallback) : result;
        }
    }
}
