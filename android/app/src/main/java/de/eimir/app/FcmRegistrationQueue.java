package de.eimir.app;

import android.content.Context;
import androidx.annotation.VisibleForTesting;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.TaskExecutors;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.Callable;
import java.util.function.BooleanSupplier;

/** Owns asynchronous SDK resource ordering independently of Activity lifetimes. */
@VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
public final class FcmRegistrationQueue {
    public interface Operations {
        void disableAutoInit();
        Task<Void> register();
        Task<Void> unregister();
        Task<Void> deleteInstallation();
        Task<String> installationId();
    }

    private static FcmRegistrationQueue instance;
    private final Context context;
    private final Operations operations;
    private Task<Void> tail = Tasks.forResult(null);
    private boolean retirementRequested;

    public FcmRegistrationQueue(Context context, Operations operations) {
        this.context = context.getApplicationContext();
        this.operations = operations;
    }

    public static synchronized FcmRegistrationQueue get(Context context) {
        if (instance == null) instance = new FcmRegistrationQueue(context, new Operations() {
            public void disableAutoInit() { FirebaseMessaging.getInstance().setAutoInitEnabled(false); }
            public Task<Void> register() { return FirebaseMessaging.getInstance().register(); }
            public Task<Void> unregister() { return FirebaseMessaging.getInstance().unregister(); }
            public Task<Void> deleteInstallation() { return FirebaseInstallations.getInstance().delete(); }
            public Task<String> installationId() { return FirebaseInstallations.getInstance().getId(); }
        });
        return instance;
    }

    private synchronized <T> Task<T> enqueue(Callable<Task<T>> operation) {
        Task<T> result = tail.continueWithTask(TaskExecutors.MAIN_THREAD, previous -> operation.call());
        // A failed operation must not break serialization of later cleanup.
        tail = result.continueWith(TaskExecutors.MAIN_THREAD, completed -> null);
        return result;
    }

    public Task<String> register(BooleanSupplier current) {
        return enqueue(() -> {
            if (!current.getAsBoolean()) return cancelled();
            operations.disableAutoInit();
            Task<Void> cleanup = PushActivation.cleanupPending(context) ? retireNow() : Tasks.forResult(null);
            return cleanup.onSuccessTask(TaskExecutors.MAIN_THREAD, ignored -> {
                if (!current.getAsBoolean()) return cancelled();
                return operations.register().onSuccessTask(TaskExecutors.MAIN_THREAD, registered -> {
                    if (!current.getAsBoolean()) return cancelled();
                    return operations.installationId();
                }).onSuccessTask(TaskExecutors.MAIN_THREAD, fid ->
                current.getAsBoolean() ? Tasks.forResult(fid) : cancelled());
            });
        });
    }

    public synchronized Task<Void> retire() {
        retirementRequested = true;
        PushActivation.cleanupPending(context, true);
        return enqueue(this::retireNow);
    }

    public Task<String> identity(BooleanSupplier current) {
        return enqueue(() -> {
            if (!current.getAsBoolean() || PushActivation.cleanupPending(context)) return cancelled();
            operations.disableAutoInit();
            return operations.installationId().onSuccessTask(TaskExecutors.MAIN_THREAD, fid ->
            current.getAsBoolean() ? Tasks.forResult(fid) : cancelled());
        });
    }

    private Task<Void> retireNow() {
        if (!retirementRequested && !PushActivation.cleanupPending(context)) return Tasks.forResult(null);
        try { operations.disableAutoInit(); } catch (RuntimeException unavailable) {
            // Still attempt unregister and deletion when one SDK component fails.
        }
        Task<Void> unregister;
        try {
            unregister = operations.unregister();
        } catch (RuntimeException unavailable) {
            unregister = Tasks.forException(unavailable);
        }
        return unregister.continueWithTask(TaskExecutors.MAIN_THREAD, ignored -> operations.deleteInstallation())
            .onSuccessTask(TaskExecutors.MAIN_THREAD, deleted -> {
            // Successful installation deletion supersedes an unregister error.
            // This requests provider deletion; it does not claim immediate
            // erasure of Google's retained live and backup data.
            retirementRequested = false;
            return PushActivation.cleanupPending(context, false) ? Tasks.forResult(null)
                : Tasks.forException(new IllegalStateException("PUSH_STORAGE_UNAVAILABLE"));
        });
    }

    private static <T> Task<T> cancelled() {
        return Tasks.forException(new IllegalStateException("PUSH_REQUEST_CANCELLED"));
    }
}
