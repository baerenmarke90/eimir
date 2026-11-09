package de.eimir.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "BackgroundMediaUploads", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class BackgroundMediaUploadsPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override public void load() {
        io.execute(() -> {
            try { BackgroundMediaTransfers.records(getContext()); }
            catch (Exception unavailable) { /* Existing cleanup remains retryable on observation. */ }
        });
        openTransfer(getActivity().getIntent());
    }
    @Override protected void handleOnNewIntent(Intent intent) { openTransfer(intent); }
    private void openTransfer(Intent intent) {
        try {
            JSObject target = BackgroundMediaTransfers.openTarget(getContext(), intent);
            if (target == null) return;
            // Activity recreation must not replay a consumed tap.
            intent.removeExtra("targetId");
            notifyListeners("transferOpen", target, true);
        } catch (Exception stale) { /* Unsaved, malformed and foreign-session targets stay silent. */ }
    }

    @PluginMethod public void bindTarget(PluginCall call) {
        io.execute(() -> {
            try {
                BackgroundMediaTransfers.bindTarget(getContext(), call.getString("instance"), call.getString("accountId"),
                    call.getString("spaceId"), call.getString("attachmentId"), call.getString("targetType"), call.getString("targetId"));
                call.resolve();
            } catch (Exception unavailable) { call.reject("Video target unavailable", "VIDEO_TRANSFER_UNAVAILABLE"); }
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
    @Override protected void handleOnDestroy() { io.shutdown(); super.handleOnDestroy(); }
}
