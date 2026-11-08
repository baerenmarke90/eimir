package de.eimir.app;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground data-sync fallback for the supported Android 8-13 clients. */
public class BackgroundMediaUploadService extends Service {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile String current;
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String id = intent == null ? null : intent.getStringExtra("attachmentId");
        try {
            BackgroundMediaTransfers.Record record = BackgroundMediaTransfers.read(this, id);
            startForeground(BackgroundMediaTransfers.FOREGROUND_NOTIFICATION, BackgroundMediaTransfers.notification(this, record));
            io.execute(() -> {
                current = id;
                BackgroundMediaTransfers.run(this, id, value -> getSystemService(NotificationManager.class)
                    .notify(BackgroundMediaTransfers.FOREGROUND_NOTIFICATION, BackgroundMediaTransfers.notification(this, value)));
                current = null;
                if (stopSelfResult(startId)) stopForeground(STOP_FOREGROUND_REMOVE);
            });
            return START_REDELIVER_INTENT;
        } catch (Exception unavailable) { stopSelf(startId); return START_NOT_STICKY; }
    }
    @Override public void onTimeout(int startId, int type) {
        if (current != null) BackgroundMediaTransfers.stop(current);
        stopSelf();
    }
    @Override public void onDestroy() {
        io.shutdownNow();
        if (current != null) BackgroundMediaTransfers.stop(current);
        super.onDestroy();
    }
}
