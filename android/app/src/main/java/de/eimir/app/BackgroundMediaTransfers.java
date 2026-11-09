package de.eimir.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.net.Uri;
import android.util.AtomicFile;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;

/** Native ownership of explicitly initiated, bounded Attachment transfers. */
final class BackgroundMediaTransfers {
    static final String CHANNEL = "eimir-media-transfers-v1";
    private static final String OPEN_TRANSFER = "de.eimir.app.OPEN_MEDIA_TRANSFER";
    static final int FOREGROUND_NOTIFICATION = 42001;
    static final long MAX_FILE = 250L * 1024 * 1024;
    static final long MAX_TOTAL = 500L * 1024 * 1024;
    static final long RETENTION = 24L * 60 * 60 * 1000;
    private static final ConcurrentHashMap<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private static final java.util.Set<String> running = ConcurrentHashMap.newKeySet();
    interface Progress { void update(Record value); }

    static final class Record {
        final JSONObject value;
        Record(JSONObject value) { this.value = value; }
        String id() { return value.optString("attachmentId"); }
        String instance() { return value.optString("instance"); }
        String account() { return value.optString("accountId"); }
        String space() { return value.optString("spaceId"); }
        String phase() { return value.optString("phase"); }
        int progress() { return value.optInt("progress"); }
        int jobId() { return value.optInt("jobId"); }
        boolean expired() { return System.currentTimeMillis() - value.optLong("createdAt") >= RETENTION; }
    }
    static void requireId(String value) {
        if (value == null || !UUID.fromString(value).toString().equals(value)) throw new IllegalArgumentException();
    }
    static JSONObject session(Context context, String instance, String account, String space) throws Exception {
        requireId(account); requireId(space);
        URI uri = new URI(instance);
        if (instance.length() > 2048 || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) throw new IOException("Invalid instance");
        JSONObject session = NativeSessionStoragePlugin.snapshot(context, instance);
        if (!account.equals(session.getJSONObject("account").getString("id"))
                || !space.equals(session.optString("spaceId"))) throw new IOException("Transfer ownership changed");
        return session;
    }
    private static File root(Context context) throws IOException {
        File root = new File(context.getNoBackupFilesDir(), "media-transfers-v1");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Private transfer storage unavailable");
        return root;
    }
    static File source(Context context, String id) throws IOException {
        requireId(id); return new File(root(context), id + ".media");
    }
    private static AtomicFile file(Context context, String id) throws IOException {
        requireId(id); return new AtomicFile(new File(root(context), id + ".job"));
    }
    private static void save(Context context, Record record) throws Exception {
        AtomicFile target = file(context, record.id());
        byte[] bytes = NativeSessionCipher.encrypt(NativeSessionStoragePlugin.key(), "eimir-media-v1:" + record.id(), record.value.toString());
        FileOutputStream output = target.startWrite();
        try { output.write(bytes); target.finishWrite(output); }
        catch (Exception failure) { target.failWrite(output); throw failure; }
    }
    static synchronized Record read(Context context, String id) throws Exception {
        AtomicFile target = file(context, id);
        if (target.getBaseFile().length() > NativeSessionCipher.MAX_ENVELOPE_BYTES) throw new IOException("Invalid transfer record");
        JSONObject value = new JSONObject(NativeSessionCipher.decrypt(NativeSessionStoragePlugin.key(), "eimir-media-v1:" + id, target.readFully()));
        if (!id.equals(value.optString("attachmentId"))) throw new IOException("Invalid transfer identity");
        return new Record(value);
    }
    static synchronized List<Record> records(Context context) throws Exception {
        List<Record> result = new ArrayList<>();
        File[] orphans = root(context).listFiles((dir, name) -> name.endsWith(".media"));
        if (orphans != null) for (File orphan : orphans) {
            if (System.currentTimeMillis() - orphan.lastModified() >= RETENTION
                    && !new File(root(context), orphan.getName().replace(".media", ".job")).exists()) orphan.delete();
        }
        File[] files = root(context).listFiles((dir, name) -> name.endsWith(".job"));
        if (files == null) throw new IOException("Private transfer storage unavailable");
        for (File entry : files) {
            String id = entry.getName().replace(".job", "");
            try {
                Record record = read(context, id);
                if (record.expired()) cancel(context, id);
                else result.add(record);
            } catch (Exception invalid) { cancel(context, id); }
        }
        // Older builds detached their final progress notice after deleting staging.
        // Reconcile only this channel; ordinary push notifications keep their owner.
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        for (android.service.notification.StatusBarNotification notice : notifications.getActiveNotifications()) {
            if (CHANNEL.equals(notice.getNotification().getChannelId())
                    && !(notice.getId() == FOREGROUND_NOTIFICATION && !result.isEmpty())
                    && !containsJob(result, notice.getId())) notifications.cancel(notice.getTag(), notice.getId());
        }
        return result;
    }
    static Record stage(Context context, String instance, String account, String space,
            String id, String sourceName, long size, String type) throws Exception {
        requireId(id); session(context, instance, account, space);
        if (size <= 0 || size > MAX_FILE || !("video/mp4".equals(type) || "video/quicktime".equals(type)))
            throw new IOException("Invalid selected video");
        Record record;
        synchronized (BackgroundMediaTransfers.class) {
            List<Record> existing = records(context);
            long reserved = size;
            for (Record entry : existing) reserved += entry.value.optLong("size");
            if (existing.size() >= 20 || reserved > MAX_TOTAL || file(context, id).getBaseFile().exists())
                throw new IOException("Transfer staging budget exceeded");
            int jobId = 0x52000000 | (id.hashCode() & 0x00ffffff);
            while (containsJob(existing, jobId)) jobId++;
            record = new Record(new JSONObject().put("attachmentId", id).put("instance", instance)
                .put("accountId", account).put("spaceId", space).put("size", size).put("mimeType", type)
                .put("createdAt", System.currentTimeMillis()).put("phase", "uploading").put("progress", 0).put("jobId", jobId));
            save(context, record);
        }
        try (AssetFileDescriptor descriptor = SelectedMediaProvider.openForTransfer(context, sourceName, type);
                InputStream input = descriptor.createInputStream();
                FileOutputStream output = new FileOutputStream(source(context, id))) {
            byte[] buffer = new byte[64 * 1024];
            long copied = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                requireActive(context, id);
                copied += count;
                if (copied > size) throw new IOException("Selected video size changed");
                output.write(buffer, 0, count);
            }
            if (copied != size) throw new IOException("Selected video size changed");
            output.getFD().sync();
        } catch (Exception failure) { cancel(context, id); throw failure; }
        try { session(context, instance, account, space); requireActive(context, id); }
        catch (Exception failure) { cancel(context, id); throw failure; }
        return record;
    }
    private static boolean containsJob(List<Record> records, int id) {
        for (Record entry : records) if (entry.jobId() == id) return true;
        return false;
    }
    static void schedule(Context context, Record record) throws Exception {
        if (!MainActivity.isForeground()) throw new IOException("Transfers must be started by a visible user action");
        session(context, record.instance(), record.account(), record.space());
        if (Build.VERSION.SDK_INT >= 34) {
            JobInfo job = userInitiatedJob(context, record);
            if (context.getSystemService(JobScheduler.class).schedule(job) != JobScheduler.RESULT_SUCCESS)
                throw new IOException("Transfer scheduling unavailable");
        } else {
            ContextCompat.startForegroundService(context, new Intent(context, BackgroundMediaUploadService.class)
                .putExtra("attachmentId", record.id()));
        }
    }
    @androidx.annotation.RequiresApi(34)
    static JobInfo userInitiatedJob(Context context, Record record) {
        PersistableBundle extras = new PersistableBundle(); extras.putString("attachmentId", record.id());
        return new JobInfo.Builder(record.jobId(), new ComponentName(context, BackgroundMediaUploadJob.class))
            .setUserInitiated(true).setRequiredNetwork(new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build())
            .setEstimatedNetworkBytes(64 * 1024, record.value.optLong("size")).setExtras(extras).build();
    }
    static synchronized void requireActive(Context context, String id) throws IOException {
        if (Thread.currentThread().isInterrupted() || !file(context, id).getBaseFile().exists()) throw new InterruptedIOException();
    }
    static synchronized Record update(Context context, String id, String phase, int progress) throws Exception {
        requireActive(context, id);
        Record record = read(context, id);
        record.value.put("phase", phase).put("progress", Math.max(0, Math.min(100, progress)));
        save(context, record);
        return record;
    }
    static void stop(String id) {
        HttpURLConnection connection = connections.remove(id);
        if (connection != null) connection.disconnect();
    }
    static synchronized void cancel(Context context, String id) throws Exception {
        requireId(id); stop(id);
        Record record = null;
        try { record = read(context, id); } catch (Exception unavailable) { /* A corrupt record still loses its bytes. */ }
        file(context, id).delete();
        source(context, id).delete();
        if (record != null) {
            context.getSystemService(JobScheduler.class).cancel(record.jobId());
            context.getSystemService(NotificationManager.class).cancel(record.jobId());
        }
    }
    static synchronized void cancelInstance(Context context, String instance) throws Exception {
        for (Record record : records(context)) if (instance.equals(record.instance())) cancel(context, record.id());
    }
    static JSArray list(Context context, String instance, String account, String space) throws Exception {
        session(context, instance, account, space);
        JSArray items = new JSArray();
        for (Record record : records(context)) if (instance.equals(record.instance()) && account.equals(record.account()) && space.equals(record.space()))
            items.put(new JSObject().put("attachmentId", record.id()).put("phase", record.phase()).put("progress", record.progress()));
        return items;
    }
    static synchronized void bindTarget(Context context, String instance, String account, String space,
            String id, String targetType, String targetId) throws Exception {
        session(context, instance, account, space); requireId(id); requireTarget(targetType, targetId);
        // Completion can win the race with a successful parent save. It has no notice left to bind.
        if (!file(context, id).getBaseFile().exists()) return;
        Record record = read(context, id);
        if (!instance.equals(record.instance()) || !account.equals(record.account()) || !space.equals(record.space()))
            throw new IOException("Transfer ownership changed");
        record.value.put("targetType", targetType).put("targetId", targetId);
        save(context, record);
        // Update the existing admission PendingIntent without posting a stale progress frame.
        contentIntent(context, record);
    }
    private static void requireTarget(String type, String id) {
        requireId(id);
        if (!"MEMORY".equals(type) && !"HEART_MOMENT".equals(type)) throw new IllegalArgumentException();
    }
    static Intent notificationIntent(Context context, String id) {
        requireId(id);
        return new Intent(context, LauncherActivity.class).setAction(OPEN_TRANSFER)
            .setData(Uri.parse("de.eimir.app://media-transfers/" + id))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }
    static synchronized Intent notificationIntent(Context context, Record progress) {
        Record record = progress;
        // A queued progress frame may predate the confirmed parent binding.
        try { record = read(context, progress.id()); } catch (Exception completed) { /* Use the final owned snapshot. */ }
        return notificationIntent(context, record.id())
            .putExtra("instance", record.instance()).putExtra("accountId", record.account()).putExtra("spaceId", record.space())
            .putExtra("targetType", record.value.optString("targetType")).putExtra("targetId", record.value.optString("targetId"));
    }
    static PendingIntent contentIntent(Context context, Record record) {
        return PendingIntent.getActivity(context, record.jobId(), notificationIntent(context, record), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static JSObject openTarget(Context context, Intent intent) throws Exception {
        if (intent == null || !OPEN_TRANSFER.equals(intent.getAction()) || intent.getData() == null) return null;
        String id = intent.getData().getLastPathSegment();
        requireId(id);
        if (!notificationIntent(context, id).getData().equals(intent.getData())) return null;
        String instance = intent.getStringExtra("instance"), account = intent.getStringExtra("accountId"), space = intent.getStringExtra("spaceId");
        session(context, instance, account, space);
        String type = intent.getStringExtra("targetType"), target = intent.getStringExtra("targetId");
        requireTarget(type, target);
        return new JSObject().put("instance", instance).put("accountId", account).put("spaceId", space)
            .put("attachmentId", id).put("targetType", type).put("targetId", target);
    }
    private static HttpURLConnection open(Context context, Record record, String suffix, String method) throws Exception {
        requireActive(context, record.id());
        JSONObject snapshot = session(context, record.instance(), record.account(), record.space());
        JSONObject tokens = snapshot.getJSONObject("tokens");
        if (!Instant.parse(tokens.getString("accessExpiresAt")).isAfter(Instant.now())) throw new IOException("Session refresh required");
        URI endpoint = new URI(record.instance().replaceAll("/+$", "") + "/api/v1/spaces/" + record.space() + "/attachments/" + record.id() + suffix);
        HttpURLConnection connection = (HttpURLConnection) endpoint.toURL().openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(20_000); connection.setReadTimeout(30_000);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization", "Bearer " + tokens.getString("accessToken"));
        connection.setRequestProperty("Accept", "application/json");
        connections.put(record.id(), connection);
        return connection;
    }
    private static String metadata(Context context, Record record) throws Exception {
        HttpURLConnection connection = open(context, record, "", "GET");
        try {
            if (connection.getResponseCode() == 404) { cancel(context, record.id()); throw new IOException("Attachment no longer available"); }
            if (connection.getResponseCode() != 200) throw new IOException("Attachment status unavailable");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 64 * 1024) throw new IOException("Attachment status exceeds bound");
                    bytes.write(buffer, 0, count);
                }
                return new JSONObject(bytes.toString("UTF-8")).getString("status");
            }
        } finally { connections.remove(record.id(), connection); connection.disconnect(); }
    }
    static void run(Context context, String id, Progress progress) {
        if (!running.add(id)) return;
        try {
            Record record = read(context, id);
            if (record.expired()) { cancel(context, id); return; }
            String status = metadata(context, record);
            if (!"READY".equals(status) && !"PROCESSING".equals(status)) {
                if (!"PENDING".equals(status)) throw new IOException("Attachment transfer is not pending");
                HttpURLConnection connection = open(context, record, "/content", "PUT");
                try {
                    long size = record.value.getLong("size");
                    if (source(context, id).length() != size) throw new IOException("Staged video unavailable");
                    connection.setDoOutput(true); connection.setFixedLengthStreamingMode(size);
                    connection.setRequestProperty("Content-Type", record.value.getString("mimeType"));
                    try (InputStream input = new FileInputStream(source(context, id)); OutputStream output = connection.getOutputStream()) {
                        byte[] buffer = new byte[64 * 1024]; long sent = 0; int count;
                        TransferProgress updates = new TransferProgress();
                        while ((count = input.read(buffer)) != -1) {
                            requireActive(context, id); output.write(buffer, 0, count); sent += count;
                            int percent = (int) Math.min(99, sent * 100 / size);
                            if (updates.advance(percent, SystemClock.elapsedRealtime()))
                                progress.update(update(context, id, "uploading", percent));
                        }
                    }
                    int response = connection.getResponseCode();
                    if (response < 200 || response >= 300) throw new IOException("Video transfer was not accepted");
                } finally { connections.remove(id, connection); connection.disconnect(); }
                progress.update(update(context, id, "processing", 100));
                connection = open(context, record, "/finalize", "POST");
                try {
                    connection.setDoOutput(true); connection.setFixedLengthStreamingMode(2);
                    connection.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream output = connection.getOutputStream()) { output.write(new byte[] {'{', '}'}); }
                    int response = connection.getResponseCode();
                    if (response < 200 || response >= 300) throw new IOException("Video finalization was not confirmed");
                } finally { connections.remove(id, connection); connection.disconnect(); }
            }
            progress.update(update(context, id, "processing", 100));
            synchronized (BackgroundMediaTransfers.class) { file(context, id).delete(); source(context, id).delete(); }
        } catch (Exception unavailable) {
            try { if (!Thread.currentThread().isInterrupted()) progress.update(update(context, id, "failed", 0)); }
            catch (Exception cancelled) { /* Cancellation must never recreate a record or its bytes. */ }
        } finally { running.remove(id); stop(id); }
    }
    static Notification notification(Context context, Record record) {
        Context localized = context;
        try {
            JSONObject account = session(context, record.instance(), record.account(), record.space()).getJSONObject("account");
            localized = RecipientLanguage.context(context, account.optString("languagePreference", account.optString("locale", "de")));
        } catch (Exception unavailable) { /* Generic system-language fallback contains no content. */ }
        return notification(localized, record.phase(), record.progress(), contentIntent(context, record));
    }
    static Notification initialNotification(Context context, int jobId, String id) {
        // Binding may precede JobScheduler admission; never erase its updated extras.
        Intent launch = notificationIntent(context, id);
        PendingIntent tap = PendingIntent.getActivity(context, jobId, launch, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (tap == null) tap = PendingIntent.getActivity(context, jobId, launch, PendingIntent.FLAG_IMMUTABLE);
        return notification(context, "uploading", 0, tap);
    }
    private static Notification notification(Context localized, String phase, int progress, PendingIntent tap) {
        NotificationManager manager = localized.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, localized.getString(R.string.media_transfer_channel), NotificationManager.IMPORTANCE_LOW));
        return new Notification.Builder(localized, CHANNEL).setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(localized.getString(R.string.media_transfer_title))
            .setContentText(localized.getString("failed".equals(phase) ? R.string.media_transfer_failed : "processing".equals(phase) ? R.string.media_transfer_processing : R.string.media_transfer_progress, progress))
            .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).setOngoing("uploading".equals(phase))
            .setVisibility(Notification.VISIBILITY_SECRET).setCategory(Notification.CATEGORY_PROGRESS)
            .setProgress(100, progress, false).build();
    }
}
