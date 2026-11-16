package de.eimir.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Build;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.FutureTask;

/** Android 14+ user-initiated transfers run independently of the WebView. */
public class BackgroundMediaUploadJob extends JobService {
    private final ExecutorService io = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<Integer, JobRun> tasks = new ConcurrentHashMap<>();
    @Override public boolean onStartJob(JobParameters parameters) {
        if (Build.VERSION.SDK_INT < 34) return false;
        String id = parameters.getExtras().getString("attachmentId");
        // Admission notification must not wait behind another transfer's I/O.
        setNotification(parameters, parameters.getJobId(), BackgroundMediaTransfers.initialNotification(this, parameters.getJobId(), id), JOB_END_NOTIFICATION_POLICY_REMOVE);
        JobRun run = new JobRun(parameters, id);
        tasks.put(parameters.getJobId(), run);
        io.execute(run.task);
        return true;
    }
    private final class JobRun {
        final JobParameters parameters;
        final FutureTask<Void> task;
        JobRun(JobParameters parameters, String id) {
            this.parameters = parameters;
            task = new FutureTask<>(() -> {
                try {
                    BackgroundMediaTransfers.run(BackgroundMediaUploadJob.this, id, value -> publish(parameters, value));
                } finally {
                    // A stopped/replaced execution cannot finish or remove its successor.
                    if (tasks.remove(parameters.getJobId(), this)) jobFinished(parameters, false);
                }
                return null;
            });
        }
    }
    private void publish(JobParameters parameters, BackgroundMediaTransfers.Record value) {
        JobRun run = tasks.get(parameters.getJobId());
        if (Build.VERSION.SDK_INT >= 34 && run != null && run.parameters == parameters) {
            // JobService queues these in order. Direct NotificationManager updates
            // can race its asynchronous admission notification and regress to 0%.
            setNotification(parameters, value.jobId(), BackgroundMediaTransfers.notification(this, value),
                "failed".equals(value.phase()) ? JOB_END_NOTIFICATION_POLICY_DETACH : JOB_END_NOTIFICATION_POLICY_REMOVE);
        }
    }
    @Override public boolean onStopJob(JobParameters parameters) {
        String id = parameters.getExtras().getString("attachmentId");
        // Stop callbacks carry a newly parceled JobParameters, not the start object.
        JobRun run = tasks.remove(parameters.getJobId());
        if (run != null) run.task.cancel(true);
        if (id != null) BackgroundMediaTransfers.stop(id);
        boolean reschedule = Build.VERSION.SDK_INT >= 31 && parameters.getStopReason() != JobParameters.STOP_REASON_USER;
        if (!reschedule && id != null) io.execute(() -> {
            try { BackgroundMediaTransfers.update(this, id, "failed", 0); }
            catch (Exception revoked) { /* A removed transfer must stay absent. */ }
        });
        return reschedule;
    }
    @Override public void onDestroy() {
        JobRun[] active = tasks.values().toArray(new JobRun[0]);
        tasks.clear();
        for (JobRun run : active) {
            String id = run.parameters.getExtras().getString("attachmentId");
            if (id != null) BackgroundMediaTransfers.stop(id);
            run.task.cancel(true);
        }
        io.shutdownNow(); super.onDestroy();
    }
}
