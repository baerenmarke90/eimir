package de.eimir.app;

import android.app.NotificationManager;
import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Build;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;

/** Android 14+ user-initiated transfers run independently of the WebView. */
public class BackgroundMediaUploadJob extends JobService {
    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<Integer, Future<?>> tasks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, JobParameters> owners = new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters parameters) {
        if (Build.VERSION.SDK_INT < 34) return false;
        String id = parameters.getExtras().getString("attachmentId");
        // Admission notification must not wait behind another transfer's I/O.
        setNotification(parameters, parameters.getJobId(), BackgroundMediaTransfers.initialNotification(this, parameters.getJobId()), JOB_END_NOTIFICATION_POLICY_DETACH);
        owners.put(parameters.getJobId(), parameters);
        FutureTask<Void> task = new FutureTask<>(() -> {
            try {
                BackgroundMediaTransfers.Record record = BackgroundMediaTransfers.read(this, id);
                getSystemService(NotificationManager.class).notify(record.jobId(), BackgroundMediaTransfers.notification(this, record));
                BackgroundMediaTransfers.run(this, id, value -> getSystemService(NotificationManager.class)
                    .notify(value.jobId(), BackgroundMediaTransfers.notification(this, value)));
            } catch (Exception unavailable) {
                // No live authority means no transfer. Private staging stays bounded.
                getSystemService(NotificationManager.class).cancel(parameters.getJobId());
            } finally {
                tasks.remove(parameters.getJobId());
                if (owners.remove(parameters.getJobId(), parameters)) jobFinished(parameters, false);
            }
            return null;
        });
        tasks.put(parameters.getJobId(), task);
        io.execute(task);
        return true;
    }
    @Override public boolean onStopJob(JobParameters parameters) {
        String id = parameters.getExtras().getString("attachmentId");
        owners.remove(parameters.getJobId(), parameters);
        Future<?> task = tasks.remove(parameters.getJobId());
        if (task != null) task.cancel(true);
        if (id != null) BackgroundMediaTransfers.stop(id);
        boolean reschedule = Build.VERSION.SDK_INT >= 31 && parameters.getStopReason() != JobParameters.STOP_REASON_USER;
        if (!reschedule && id != null) io.execute(() -> {
            try { BackgroundMediaTransfers.update(this, id, "failed", 0); }
            catch (Exception revoked) { /* A removed transfer must stay absent. */ }
        });
        return reschedule;
    }
    @Override public void onDestroy() {
        for (JobParameters owner : owners.values()) {
            String id = owner.getExtras().getString("attachmentId");
            if (id != null) BackgroundMediaTransfers.stop(id);
        }
        owners.clear();
        for (Future<?> task : tasks.values()) task.cancel(true);
        io.shutdownNow(); super.onDestroy();
    }
}
