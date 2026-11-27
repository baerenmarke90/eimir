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
    private static final String EXTRA_NOTIFICATION_ID = "de.eimir.app.notificationId";

    public static void cancel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        for (android.service.notification.StatusBarNotification notice : manager.getActiveNotifications()) {
            if (CHANNEL.equals(notice.getNotification().getChannelId())) manager.cancel(notice.getTag(), notice.getId());
        }
    }

    /**
     * Removes the notice a person just opened. The body tap already cancels it
     * (setAutoCancel), but an action button does not, so the open itself clears
     * the notice no matter which control was used.
     */
    public static void cancelOpened(Context context, String notificationId) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (notificationId != null) manager.cancel(notificationId, NOTIFICATION);
        else manager.cancel(NOTIFICATION);
    }

    /**
     * The notification ids of every eimir. notice still in the tray (#2345). The
     * shared neutral slot carries its id as an extra, so it is listed too; a
     * notice without an id (a plain wake) is not.
     */
    public static java.util.List<String> delivered(Context context) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return ids;
        for (android.service.notification.StatusBarNotification notice : manager.getActiveNotifications()) {
            String id = deliveredId(notice);
            if (id != null && !ids.contains(id)) ids.add(id);
        }
        return ids;
    }

    /**
     * Removes the tray notices of these notification ids (#2345): they were read,
     * expired or are no longer current, wherever that happened.
     */
    public static void withdraw(Context context, java.util.Collection<String> notificationIds) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || notificationIds.isEmpty()) return;
        for (android.service.notification.StatusBarNotification notice : manager.getActiveNotifications()) {
            String id = deliveredId(notice);
            if (id != null && notificationIds.contains(id)) manager.cancel(notice.getTag(), notice.getId());
        }
    }

    private static String deliveredId(android.service.notification.StatusBarNotification notice) {
        if (!CHANNEL.equals(notice.getNotification().getChannelId())) return null;
        String id = notice.getNotification().extras.getString(EXTRA_NOTIFICATION_ID);
        return id != null ? id : notice.getTag();
    }

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
        return notificationIntent(context, activation, notificationId, null);
    }

    /**
     * A ServerAdmin notice also carries its closed topic code (#2337), so a tap can
     * open ServerAdmin even when the notice itself can no longer be resolved.
     */
    public static Intent notificationIntent(Context context, PushActivation activation, String notificationId, String operatorTopic) {
        Intent intent = notificationIntent(context, activation).putExtra("notificationId", notificationId);
        if (notificationId != null) intent.addCategory("de.eimir.app.push.notification." + notificationId);
        if (operatorTopic != null) intent.putExtra("operatorTopic", operatorTopic);
        return intent;
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
        present(context, activation, notificationId, null, null);
    }

    static void presentReference(Context context, PushActivation activation, String notificationId) {
        synchronized (PushActivation.class) {
            if (!PushActivation.current(context, activation)
                || !PushReceipts.claim(context, activation, notificationId)) return;
            present(context, activation, notificationId);
        }
    }

    @VisibleForTesting(otherwise = VisibleForTesting.PACKAGE_PRIVATE)
    public static void presentPreview(Context context, PushActivation activation, PushPreview preview) {
        present(context, activation, preview.notificationId, preview, WishDatePush.fromFcm(context, preview));
    }

    static void presentWishDate(Context context, PushActivation activation, String notificationId, WishDatePush wishDate) {
        present(context, activation, notificationId, null, wishDate);
    }

    /** What a locked screen shows when the person chose to hide sensitive content. */
    private static android.app.Notification publicVersion(Context context) {
        return new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(context.getString(R.string.push_notification_body))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).build();
    }

    private static void present(Context context, PushActivation activation, String notificationId, PushPreview preview, WishDatePush wishDate) {
        synchronized (PushActivation.class) {
            if (!PushActivation.current(context, activation)) return;
            if ((preview != null || wishDate != null) && !PushReceipts.claim(context, activation, notificationId)) return;
            NativePushBridge.wake(context, activation);
            if (MainActivity.isForeground()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return;
            manager.createNotificationChannel(new NotificationChannel(CHANNEL,
                context.getString(R.string.push_channel_name), NotificationManager.IMPORTANCE_DEFAULT));
            PendingIntent tap = PendingIntent.getActivity(context, 0,
                notificationIntent(context, activation, notificationId, preview != null ? preview.operatorTopic() : null),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            // Every notice is VISIBILITY_PRIVATE with a neutral public version, and the
            // channel sets no lock-screen override. Android's own lock-screen setting
            // then decides alone (Product Owner, 2026-11-21, #2158): "Show all
            // notification content" shows the full notice on a locked screen,
            // "Hide sensitive content" shows only the public version below, and
            // "Don't show notifications" shows nothing. The app forces neither.
            NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_launcher_monochrome).setContentTitle(context.getString(R.string.app_name))
                .setContentText(context.getString(R.string.push_notification_body)).setContentIntent(tap)
                .setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            if (notificationId != null) {
                // Lets the app withdraw the notice once it was handled elsewhere (#2345).
                android.os.Bundle extras = new android.os.Bundle();
                extras.putString(EXTRA_NOTIFICATION_ID, notificationId);
                notification.addExtras(extras);
            }
            if (wishDate != null) {
                String detail = wishDate.detail(context);
                // A Wish date notice no longer overrides the setting with VISIBILITY_PUBLIC.
                notification.setContentTitle(wishDate.headline).setContentText(detail)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(detail))
                    .setOnlyAlertOnce(true)
                    .setPublicVersion(publicVersion(context))
                    .addAction(0, wishDate.action(context), tap);
            } else if (preview != null) {
                String body = preview.body(context);
                notification.setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setOnlyAlertOnce(true)
                    .setPublicVersion(publicVersion(context));
                String action = preview.action(context);
                if (action != null) notification.addAction(0, action, tap);
            }
            try {
                if (preview == null && wishDate == null) NotificationManagerCompat.from(context).notify(NOTIFICATION, notification.build());
                else NotificationManagerCompat.from(context).notify(notificationId, NOTIFICATION, notification.build());
            } catch (SecurityException revoked) {
                // Permission may be revoked between the check and presentation.
            }
        }
    }
}
