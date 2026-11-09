package de.eimir.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.CancellationSignal;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "BackgroundMediaUploads", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class BackgroundMediaUploadsPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService preparation = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, CancellationSignal> preparations = new ConcurrentHashMap<>();
    private static String preparationKey(PluginCall call) {
        return call.getString("instance") + "|" + call.getString("accountId") + "|" + call.getString("spaceId") + "|" + call.getString("attachmentId");
    }

    @PluginMethod public void prepare(PluginCall call) {
        String id = call.getString("attachmentId");
        String key = preparationKey(call);
        CancellationSignal cancellation = new CancellationSignal();
        try {
            BackgroundMediaTransfers.requireId(id);
            BackgroundMediaTransfers.session(getContext(), call.getString("instance"), call.getString("accountId"), call.getString("spaceId"));
            if (preparations.putIfAbsent(key, cancellation) != null) throw new IllegalArgumentException();
        } catch (Exception invalid) { call.reject("Video preparation unavailable", "VIDEO_PREPARATION_UNAVAILABLE"); return; }
        preparation.execute(() -> {
            try {
                BackgroundMediaTransfers.Record staged = BackgroundMediaTransfers.stage(getContext(), call.getString("instance"),
                    call.getString("accountId"), call.getString("spaceId"), id, call.getString("sourceName"),
                    call.getInt("size", 0), call.getString("mimeType"), cancellation);
                BackgroundMediaTransfers.Record ready = NativeVideoPreparation.prepare(getContext(), staged, cancellation);
                cancellation.throwIfCanceled();
                String type = ready.value.getString("mimeType");
                call.resolve(new JSObject().put("preparationId", id).put("size", ready.value.optLong("size"))
                    .put("type", type).put("name", "video/quicktime".equals(type) ? "video.mov" : "video.mp4"));
            } catch (Exception failure) {
                try { BackgroundMediaTransfers.cancel(getContext(), id); } catch (Exception ignored) { /* Expiry remains bounded. */ }
                call.reject("Video could not be prepared on this device", "VIDEO_PREPARATION_UNAVAILABLE");
            } finally { preparations.remove(key, cancellation); }
        });
    }
    @PluginMethod public void cancelPreparation(PluginCall call) {
        io.execute(() -> {
            try {
                String id = call.getString("attachmentId");
                BackgroundMediaTransfers.requireId(id);
                CancellationSignal cancellation = preparations.get(preparationKey(call));
                if (cancellation != null) cancellation.cancel();
                // A revoked snapshot must not keep a queued, scoped preparation alive.
                BackgroundMediaTransfers.session(getContext(), call.getString("instance"), call.getString("accountId"), call.getString("spaceId"));
                // A request can still be queued, before its staging record exists.
                try { BackgroundMediaTransfers.Record record = owned(call); BackgroundMediaTransfers.cancel(getContext(), record.id()); }
                catch (java.io.FileNotFoundException absent) { /* The cancelled queued request cannot stage. */ }
                call.resolve();
            } catch (Exception failure) { call.reject("Video preparation could not be cancelled", "VIDEO_PREPARATION_UNAVAILABLE"); }
        });
    }

    @PluginMethod public void enqueue(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !getContext().getSharedPreferences("media-transfer-permission", 0).getBoolean("asked", false)) {
            getContext().getSharedPreferences("media-transfer-permission", 0).edit().putBoolean("asked", true).apply();
            requestPermissionForAlias("notifications", call, "notificationResult");
        } else stage(call);
    }
    @PermissionCallback private void notificationResult(PluginCall call) { stage(call); }
    static BackgroundMediaTransfers.Record stageSelection(Context context, PluginCall call) throws Exception {
        String preparationId = call.getString("preparationId");
        if (preparationId != null)
            return BackgroundMediaTransfers.adoptPrepared(context, call.getString("instance"), call.getString("accountId"),
                call.getString("spaceId"), preparationId, call.getString("attachmentId"), call.getInt("size", 0));
        // Supported files fit in Integer; Capacitor getLong rejects JSON integers.
        return BackgroundMediaTransfers.stage(context, call.getString("instance"),
            call.getString("accountId"), call.getString("spaceId"), call.getString("attachmentId"),
            call.getString("sourceName"), call.getInt("size", 0), call.getString("mimeType"));
    }
    private void stage(PluginCall call) {
        io.execute(() -> {
            BackgroundMediaTransfers.Record record = null;
            try {
                record = stageSelection(getContext(), call);
                BackgroundMediaTransfers.schedule(getContext(), record);
                call.resolve();
            } catch (Exception unavailable) {
                if (record != null) try { BackgroundMediaTransfers.cancel(getContext(), record.id()); }
                catch (Exception ignored) { /* Revoked credentials and bounded expiry remain authoritative. */ }
                call.reject("Video transfer could not start", "VIDEO_TRANSFER_UNAVAILABLE");
            }
        });
    }
    @PluginMethod public void list(PluginCall call) {
        io.execute(() -> {
            try { call.resolve(new JSObject().put("items", BackgroundMediaTransfers.list(getContext(), call.getString("instance"), call.getString("accountId"), call.getString("spaceId")))); }
            catch (Exception unavailable) { call.reject("Video transfer status unavailable", "VIDEO_TRANSFER_UNAVAILABLE"); }
        });
    }
    private BackgroundMediaTransfers.Record owned(PluginCall call) throws Exception {
        String instance = call.getString("instance"), account = call.getString("accountId"), space = call.getString("spaceId");
        BackgroundMediaTransfers.session(getContext(), instance, account, space);
        BackgroundMediaTransfers.Record record = BackgroundMediaTransfers.read(getContext(), call.getString("attachmentId"));
        if (!instance.equals(record.instance()) || !account.equals(record.account()) || !space.equals(record.space())) throw new Exception("Transfer not available");
        return record;
    }
    @PluginMethod public void retry(PluginCall call) {
        io.execute(() -> {
            BackgroundMediaTransfers.Record record = null;
            try {
                record = owned(call);
                if (!"failed".equals(record.phase())) throw new Exception("Transfer is already running");
                BackgroundMediaTransfers.update(getContext(), record.id(), "uploading", 0);
                BackgroundMediaTransfers.schedule(getContext(), record);
                call.resolve();
            } catch (Exception unavailable) {
                if (record != null && "failed".equals(record.phase())) try {
                    BackgroundMediaTransfers.update(getContext(), record.id(), "failed", 0);
                } catch (Exception ignored) { /* Revocation must not recreate staging. */ }
                call.reject("Video transfer could not resume", "VIDEO_TRANSFER_UNAVAILABLE");
            }
        });
    }
    @PluginMethod public void cancel(PluginCall call) {
        io.execute(() -> {
            try { BackgroundMediaTransfers.cancel(getContext(), owned(call).id()); call.resolve(); }
            catch (Exception unavailable) { call.reject("Video transfer could not be removed", "VIDEO_TRANSFER_UNAVAILABLE"); }
        });
    }
    @Override protected void handleOnDestroy() {
        for (CancellationSignal cancellation : preparations.values()) cancellation.cancel();
        preparation.shutdown(); io.shutdown(); super.handleOnDestroy();
    }
}
