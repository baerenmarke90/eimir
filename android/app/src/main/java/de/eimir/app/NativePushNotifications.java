package de.eimir.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import androidx.annotation.VisibleForTesting;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Shared private presentation and activation-bound entry for both transports. */
@VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
public final class NativePushNotifications {
    private static final String URL = "de.eimir.app://notifications";
    private static final String CATEGORY = "de.eimir.app.push.activation.";
    private static final String CHANNEL = "eimir_notifications";
    private static final int NOTIFICATION = 1;

    public static void cancel(Context context) { NotificationManagerCompat.from(context).cancel(NOTIFICATION); }

    public static Intent notificationIntent(Context context, PushActivation activation) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(URL), context, LauncherActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            // Extras do not participate in PendingIntent identity. Keep an old
            // tap's token distinct even after a new activation updates its notice.
            .addCategory(CATEGORY + activation.activationId)
            .putExtra("accountId", activation.accountId).putExtra("apiBaseUrl", activation.apiBaseUrl)
            .putExtra("providerKey", activation.providerKey).putExtra("activationId", activation.activationId);
    }

    public static Intent notificationIntent(Context context, PushActivation activation, String notificationId) {
        return notificationIntent(context, activation).putExtra("notificationId", notificationId);
    }

    public static boolean isNotificationIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return false;
        String url = intent.getData().toString();
        return URL.equals(url) || (URL + "/").equals(url);
    }

    public static boolean matches(Context context, Intent intent) {
        PushActivation active = PushActivation.read(context);
        return active != null && isNotificationIntent(intent)
            && (!"fcm".equals(active.providerKey) || !PushActivation.cleanupPending(context))
            && active.activationId.equals(intent.getStringExtra("activationId"))
            && active.accountId.equals(intent.getStringExtra("accountId"))
            && active.apiBaseUrl.equals(intent.getStringExtra("apiBaseUrl"))
            && active.providerKey.equals(intent.getStringExtra("providerKey"))
            && intent.hasCategory(CATEGORY + active.activationId);
    }

    public static void present(Context context, PushActivation activation) {
        present(context, activation, null);
    }

    public static void present(Context context, PushActivation activation, String notificationId) {
        synchronized (PushActivation.class) {
            if (!PushActivation.current(context, activation)) return;
            NativePushBridge.wake(context, activation);
            if (MainActivity.isForeground()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return;
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,
                context.getString(R.string.push_channel_name), NotificationManager.IMPORTANCE_DEFAULT));
            PendingIntent tap = PendingIntent.getActivity(context, 0, notificationIntent(context, activation, notificationId),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher_monochrome).setContentTitle(context.getString(R.string.app_name))
                .setContentText(context.getString(R.string.push_notification_body)).setContentIntent(tap)
                .setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            try {
                NotificationManagerCompat.from(context).notify(NOTIFICATION, notification.build());
            } catch (SecurityException revoked) {
                // Permission may be revoked between the check and presentation.
            }
        }
    }
}
