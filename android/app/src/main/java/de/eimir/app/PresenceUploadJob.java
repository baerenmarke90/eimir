package de.eimir.app;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Network-bound background upload and the 6-hour heartbeat for partner location. */
public class PresenceUploadJob extends JobService {
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override public boolean onStartJob(JobParameters parameters) {
        io.execute(() -> {
            if (parameters.getJobId() == PresenceBackground.HEARTBEAT_JOB_ID) PresenceBackground.heartbeat(this);
            PresenceBackground.UploadResult result = PresenceBackground.upload(this);
            jobFinished(parameters, result == PresenceBackground.UploadResult.RETRY
                && parameters.getJobId() == PresenceBackground.UPLOAD_JOB_ID);
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters parameters) {
        // The pending fix stays stored; the system reschedules the one-off upload.
        return parameters.getJobId() == PresenceBackground.UPLOAD_JOB_ID;
    }

    @Override public void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }
}
