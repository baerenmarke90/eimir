package de.eimir.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONException;
import org.json.JSONObject;
import org.unifiedpush.android.connector.FailedReason;
import org.unifiedpush.android.connector.PushService;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PushMessage;

/** A wake has no content or route target; authenticated Web fetches the inbox. */
public final class EimirPushService extends PushService {
    private static final String CHANNEL_ID = "eimir_notifications";
    private static final AtomicInteger nextNotificationId = new AtomicInteger(1);

    @Override
    public void onNewEndpoint(PushEndpoint endpoint, String instance) {
        UnifiedPushBridge.endpoint(this, endpoint, instance);
    }

    @Override
    public void onMessage(PushMessage message, String instance) {
        if (!instance.equals(UnifiedPushBridge.activeInstance(this)) || !message.getDecrypted()) return;
        try {
            JSONObject payload = new JSONObject(new String(message.getContent(), StandardCharsets.UTF_8));
            if (payload.length() != 1 || !"wake".equals(payload.optString("type"))) return;
        } catch (JSONException error) {
            return;
        }

        UnifiedPushBridge.wake(this, instance);
        if (MainActivity.isForeground()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.createNotificationChannel(new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.push_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ));

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("de.sidebyside.app://notifications"), this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.push_notification_body))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        try {
            NotificationManagerCompat.from(this).notify(nextNotificationId.getAndIncrement(), notification.build());
        } catch (SecurityException ignored) {
            // Permission can be revoked after the check above.
        }
    }

    @Override
    public void onRegistrationFailed(FailedReason reason, String instance) {
        UnifiedPushBridge.unavailable(this, instance, reason.name());
    }

    @Override
    public void onUnregistered(String instance) {
        UnifiedPushBridge.unavailable(this, instance, "UNREGISTERED");
    }
}
