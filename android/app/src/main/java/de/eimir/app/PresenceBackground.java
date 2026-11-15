package de.eimir.app;

import android.Manifest;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.json.JSONObject;

/**
 * Background partner-location updates while the app is closed (#1792,
 * docs/m9/PARTNER-LOCATION.md section 6).
 *
 * Energy rules: only the passive provider is registered, so the app receives
 * positions other apps or the system already computed and never triggers a
 * measurement itself. A periodic heartbeat reads the last known position
 * without measuring. Uploads need network, run as ordinary jobs and happen only
 * after 1 km of movement or when the last upload is 6 hours old.
 *
 * Authorization uses a scoped presence credential that can only replace the
 * owner's snapshot; this code never refreshes the Web session. The credential
 * and the last positions are encrypted with the existing Keystore key in
 * no-backup storage and are deleted on disable, sign-out or a stopped share.
 */
final class PresenceBackground {
    static final String ACTION_LOCATION = "de.eimir.app.PRESENCE_LOCATION";
    static final int UPLOAD_JOB_ID = 0x50520001;
    static final int HEARTBEAT_JOB_ID = 0x50520002;
    static final long PASSIVE_MIN_INTERVAL_MS = 15 * 60 * 1000L;
    static final float PASSIVE_MIN_DISTANCE_M = 1000f;
    static final long HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000L;
    private static final String FILE_NAME = "presence-background-v1";
    private static final String AAD = "eimir-presence-background-v1";
    private static final int MAX_RESPONSE_BYTES = 4096;

    enum UploadResult { DONE, RETRY, STOPPED }

    private PresenceBackground() {}

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), FILE_NAME));
    }

    static synchronized JSONObject read(Context context) {
        AtomicFile target = file(context);
        if (!target.getBaseFile().exists()) return null;
        try {
            if (target.getBaseFile().length() > NativeSessionCipher.MAX_ENVELOPE_BYTES) throw new IOException("Too large");
            return new JSONObject(NativeSessionCipher.decrypt(NativeSessionStoragePlugin.key(), AAD, target.readFully()));
        } catch (Exception unreadable) {
            target.delete();
            return null;
        }
    }

    private static synchronized void write(Context context, JSONObject state) throws Exception {
        AtomicFile target = file(context);
        byte[] bytes = NativeSessionCipher.encrypt(NativeSessionStoragePlugin.key(), AAD, state.toString());
        FileOutputStream output = target.startWrite();
        try { output.write(bytes); target.finishWrite(output); }
        catch (Exception failure) { target.failWrite(output); throw failure; }
    }

    static String validInstance(String instance) throws IOException {
        try {
            URI uri = new URI(instance);
            if (instance.length() > 2048 || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) throw new IOException("Invalid instance");
            return instance.replaceAll("/+$", "");
        } catch (java.net.URISyntaxException invalid) { throw new IOException("Invalid instance"); }
    }

    static boolean hasPermissions(Context context) {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return false;
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static void enable(Context context, String instance, String credential, String expiresAt) throws Exception {
        if (credential == null || credential.length() < 20 || credential.length() > 256) throw new IOException("Invalid credential");
        Instant expiry = Instant.parse(expiresAt);
        if (!expiry.isAfter(Instant.now())) throw new IOException("Expired credential");
        JSONObject previous = read(context);
        JSONObject state = new JSONObject()
            .put("instance", validInstance(instance))
            .put("credential", credential)
            .put("expiresAt", expiry.toString());
        // Keep the last upload so re-enabling with a fresh credential does not re-send unchanged positions.
        if (previous != null && previous.has("lastPublishedAt")) {
            state.put("lastLatitude", previous.getDouble("lastLatitude"))
                .put("lastLongitude", previous.getDouble("lastLongitude"))
                .put("lastPublishedAt", previous.getLong("lastPublishedAt"));
        }
        write(context, state);
        register(context);
    }

    static void disable(Context context) {
        try {
            LocationManager manager = context.getSystemService(LocationManager.class);
            if (manager != null) manager.removeUpdates(locationIntent(context));
        } catch (Exception ignored) { /* Nothing registered. */ }
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) { scheduler.cancel(UPLOAD_JOB_ID); scheduler.cancel(HEARTBEAT_JOB_ID); }
        file(context).delete();
    }

    /** Sign-out of an instance ends background sharing for it. */
    static void disableForInstance(Context context, String instance) {
        JSONObject state = read(context);
        try {
            if (state != null && validInstance(instance).equals(state.optString("instance"))) disable(context);
        } catch (IOException invalid) { /* Unrelated instance. */ }
    }

    static boolean isEnabled(Context context) { return read(context) != null; }

    /** (Re)registers passive updates and the heartbeat; called on enable, boot and app update. */
    static void register(Context context) {
        if (read(context) == null) return;
        if (!hasPermissions(context)) { disable(context); return; }
        try {
            LocationManager manager = context.getSystemService(LocationManager.class);
            if (manager == null) return;
            manager.requestLocationUpdates(LocationManager.PASSIVE_PROVIDER,
                PASSIVE_MIN_INTERVAL_MS, PASSIVE_MIN_DISTANCE_M, locationIntent(context));
        } catch (SecurityException revoked) { disable(context); return; }
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        scheduler.schedule(new JobInfo.Builder(HEARTBEAT_JOB_ID, new ComponentName(context, PresenceUploadJob.class))
            .setPeriodic(HEARTBEAT_INTERVAL_MS)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .build());
    }

    private static PendingIntent locationIntent(Context context) {
        Intent intent = new Intent(context, PresenceLocationReceiver.class).setAction(ACTION_LOCATION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }

    /** Stores a received passive fix and schedules a network-bound upload when it matters. */
    static void onLocation(Context context, Location location) {
        JSONObject state = read(context);
        if (state == null || location == null) return;
        try {
            if (!shouldUpload(state, location.getLatitude(), location.getLongitude(), location.getTime(), System.currentTimeMillis())) return;
            state.put("pendingLatitude", location.getLatitude())
                .put("pendingLongitude", location.getLongitude())
                .put("pendingAccuracy", location.hasAccuracy() ? location.getAccuracy() : ApproximateLocationPolicy.UNKNOWN_ACCURACY_METERS)
                .put("pendingCapturedAt", location.getTime());
            write(context, state);
            scheduleUpload(context);
        } catch (Exception unavailable) { /* The next fix or heartbeat retries. */ }
    }

    static boolean shouldUpload(JSONObject state, double latitude, double longitude, long capturedAt, long now) {
        if (now - capturedAt > ApproximateLocationPlugin.MAX_ACCEPTED_AGE_MS || capturedAt - now > 2 * 60 * 1000L) return false;
        if (!state.has("lastPublishedAt")) return true;
        if (capturedAt <= state.optLong("lastPublishedAt")) {
            return false;
        }
        return PresencePublishRule.due(state.optDouble("lastLatitude"), state.optDouble("lastLongitude"),
            state.optLong("lastPublishedAt"), latitude, longitude, now);
    }

    static void scheduleUpload(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        scheduler.schedule(new JobInfo.Builder(UPLOAD_JOB_ID, new ComponentName(context, PresenceUploadJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setBackoffCriteria(5 * 60 * 1000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .build());
    }

    /** Heartbeat: reuse the freshest already-known position without measuring. */
    static void heartbeat(Context context) {
        if (!hasPermissions(context)) { disable(context); return; }
        LocationManager manager = context.getSystemService(LocationManager.class);
        if (manager == null) return;
        Location best = null;
        for (String provider : ApproximateLocationPolicy.LAST_KNOWN_PROVIDERS) {
            try {
                if (!manager.getAllProviders().contains(provider)) continue;
                Location candidate = manager.getLastKnownLocation(provider);
                if (candidate != null && (best == null || candidate.getTime() > best.getTime())) best = candidate;
            } catch (SecurityException | IllegalArgumentException unavailable) { /* Skip provider. */ }
        }
        onLocation(context, best);
    }

    /** Blocking upload of the pending fix; runs on a job thread. */
    static UploadResult upload(Context context) {
        JSONObject state = read(context);
        if (state == null) return UploadResult.STOPPED;
        if (!state.has("pendingCapturedAt")) return UploadResult.DONE;
        try {
            if (!Instant.parse(state.getString("expiresAt")).isAfter(Instant.now())) { disable(context); return UploadResult.STOPPED; }
            URI endpoint = new URI(validInstance(state.getString("instance")) + "/api/v1/partner-location/device-snapshot");
            JSONObject body = new JSONObject()
                .put("latitude", state.getDouble("pendingLatitude"))
                .put("longitude", state.getDouble("pendingLongitude"))
                .put("accuracyMeters", state.getDouble("pendingAccuracy"))
                .put("capturedAt", Instant.ofEpochMilli(state.getLong("pendingCapturedAt")).toString());
            HttpURLConnection connection = (HttpURLConnection) endpoint.toURL().openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(30_000);
                connection.setRequestMethod("PUT");
                connection.setDoOutput(true);
                connection.setRequestProperty("Authorization", "Presence " + state.getString("credential"));
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Accept", "application/json");
                try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                int status = connection.getResponseCode();
                if (status == 401 || status == 403) { disable(context); return UploadResult.STOPPED; }
                if (status == 429 || status >= 500) return UploadResult.RETRY;
                if (status != 200) { clearPending(context, state, false); return UploadResult.DONE; }
                if (!readActive(connection)) { disable(context); return UploadResult.STOPPED; }
                clearPending(context, state, true);
                return UploadResult.DONE;
            } finally { connection.disconnect(); }
        } catch (IOException offline) {
            return UploadResult.RETRY;
        } catch (Exception invalid) {
            disable(context);
            return UploadResult.STOPPED;
        }
    }

    private static boolean readActive(HttpURLConnection connection) throws Exception {
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[512]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > MAX_RESPONSE_BYTES) throw new IOException("Response exceeds bound");
                bytes.write(buffer, 0, count);
            }
            return new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())).optBoolean("active", false);
        }
    }

    private static void clearPending(Context context, JSONObject state, boolean published) throws Exception {
        if (published) {
            state.put("lastLatitude", state.getDouble("pendingLatitude"))
                .put("lastLongitude", state.getDouble("pendingLongitude"))
                .put("lastPublishedAt", state.getLong("pendingCapturedAt"));
        }
        state.remove("pendingLatitude"); state.remove("pendingLongitude");
        state.remove("pendingAccuracy"); state.remove("pendingCapturedAt");
        write(context, state);
    }
}
