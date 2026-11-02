package de.eimir.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailabilityLight;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import java.lang.ref.WeakReference;
import java.net.URI;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import kotlin.Unit;
import org.json.JSONException;
import org.json.JSONObject;
import org.unifiedpush.android.connector.UnifiedPush;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PublicKeySet;

/** The authenticated Web app owns server writes; native code owns device receipt. */
@CapacitorPlugin(name = "EimirPush", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class NativePushBridge extends Plugin {
    private static WeakReference<NativePushBridge> current = new WeakReference<>(null);
    // SDK resource ownership survives Activity destruction, but a newer SDK
    // operation for the same activation still supersedes an older completion.
    private static final AtomicInteger fcmRegistrations = new AtomicInteger();
    private final AtomicInteger registrationRequests = new AtomicInteger();
    private final AtomicReference<String> pendingEnableCallId = new AtomicReference<>();

    @Override public void load() {
        current = new WeakReference<>(this);
        synchronized (PushActivation.class) {
            if (PushActivation.cleanupPending(getContext())) {
                PushActivation pending = PushActivation.read(getContext());
                // Resume only a previous retirement. A stale FCM owner must be
                // durably removed before deletion can clear its pending marker.
                if (pending == null || !"fcm".equals(pending.providerKey) || clearOwnership(pending)) cleanupPending();
            }
        }
        notificationOpen(getActivity().getIntent());
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        notificationOpen(intent);
    }

    private void notificationOpen(Intent intent) {
        synchronized (PushActivation.class) {
            if (NativePushNotifications.matches(getContext(), intent)) {
                String notificationId = intent.getStringExtra("notificationId");
                if (notificationId != null) {
                    try {
                        String canonical = UUID.fromString(notificationId).toString();
                        notificationId = canonical.equals(notificationId) ? canonical : null;
                    } catch (IllegalArgumentException invalid) { notificationId = null; }
                }
                emit("notificationOpen", PushActivation.read(getContext()), notificationId, true);
            }
        }
    }

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        getPermissionState("notifications") == PermissionState.GRANTED;
    }

    static boolean fcmAvailable(Context context) {
        try {
            return GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
                && FirebaseApp.getInstance().getOptions().getProjectId() != null
                && FirebaseApp.getInstance().getOptions().getApiKey() != null;
        } catch (IllegalStateException unconfigured) {
            return false;
        }
    }

    private static String firebaseProjectId() {
        try { return FirebaseApp.getInstance().getOptions().getProjectId(); }
        catch (IllegalStateException unconfigured) { return null; }
    }

    private static JSObject scope(PushActivation active) {
        return new JSObject().put("accountId", active == null ? JSONObject.NULL : active.accountId)
            .put("apiBaseUrl", active == null ? JSONObject.NULL : active.apiBaseUrl)
            .put("providerKey", active == null ? JSONObject.NULL : active.providerKey)
            .put("activationId", active == null ? JSONObject.NULL : active.activationId);
    }

    @PluginMethod public void status(PluginCall call) {
        PushActivation active = PushActivation.read(getContext());
        String project = firebaseProjectId();
        boolean enabled = active != null && ("unifiedpush".equals(active.providerKey)
            ? UnifiedPush.getAckDistributor(getContext()) != null
            : active.endpointValue != null && !PushActivation.cleanupPending(getContext()));
        call.resolve(scope(active).put("enabled", enabled)
            .put("permissionGranted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled())
            .put("fcmAvailable", fcmAvailable(getContext()))
            .put("firebaseProjectId", project == null ? JSONObject.NULL : project)
            .put("androidPackage", getContext().getPackageName()));
    }

    @PluginMethod public void enable(PluginCall call) {
        int request = registrationRequests.incrementAndGet();
        pendingEnableCallId.set(call.getCallbackId());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsAllowed()) {
            requestPermissionForAlias("notifications", call, "permissionResult");
        } else selectAndRegister(call, request);
    }

    @PermissionCallback private void permissionResult(PluginCall call) {
        int request = registrationRequests.get();
        if (!isCurrentEnable(call, request)) { call.reject("PUSH_REQUEST_CANCELLED"); return; }
        if (notificationsAllowed()) selectAndRegister(call, request);
        else { pendingEnableCallId.compareAndSet(call.getCallbackId(), null); call.reject("NOTIFICATION_PERMISSION_DENIED"); }
    }

    private boolean isCurrentEnable(PluginCall call, int request) {
        return request == registrationRequests.get() && call.getCallbackId().equals(pendingEnableCallId.get());
    }

    private PushActivation configuration(PluginCall call) throws Exception {
        String account = call.getString("accountId");
        String api = call.getString("apiBaseUrl");
        String provider = call.getString("providerKey");
        if (account == null || api == null || api.length() > 2048) throw new IllegalArgumentException();
        if (!UUID.fromString(account).toString().equals(account)) throw new IllegalArgumentException();
        URI uri = new URI(api);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null
            || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) throw new IllegalArgumentException();
        if ("unifiedpush".equals(provider)) {
            String vapid = call.getString("vapidPublicKey");
            if (vapid == null || vapid.length() != 87) throw new IllegalArgumentException();
        } else if ("fcm".equals(provider)) {
            if (!fcmAvailable(getContext()) || !getContext().getPackageName().equals(call.getString("androidPackage"))
                || !FirebaseApp.getInstance().getOptions().getProjectId().equals(call.getString("firebaseProjectId"))) {
                throw new IllegalArgumentException();
            }
        } else throw new IllegalArgumentException();
        PushActivation active = PushActivation.read(getContext());
        return active != null && active.owns(account, api, provider) ? active
            : new PushActivation(account, api, provider, UUID.randomUUID().toString(), null);
    }

    private void selectAndRegister(PluginCall call, int request) {
        synchronized (PushActivation.class) {
            PushActivation selected;
            try { selected = configuration(call); }
            catch (Exception invalid) { call.reject("INVALID_PUSH_CONFIGURATION"); return; }
            if (!isCurrentEnable(call, request)) { call.reject("PUSH_REQUEST_CANCELLED"); return; }
            PushActivation previous = PushActivation.read(getContext());
            boolean ownershipCleared = previous == null || previous.activationId.equals(selected.activationId) || clearOwnership(previous);
            Task<Void> retired = previous != null && !previous.activationId.equals(selected.activationId)
                ? retire(previous) : cleanupPending();
            retired.addOnCompleteListener(result -> {
                synchronized (PushActivation.class) {
                    if (!isCurrentEnable(call, request)) { call.reject("PUSH_REQUEST_CANCELLED"); return; }
                    if (!ownershipCleared) { call.reject("PUSH_DEVICE_STORAGE_UNAVAILABLE"); return; }
                    if (!result.isSuccessful()) { call.reject("PUSH_DEVICE_CLEANUP_PENDING"); return; }
                    if ("unifiedpush".equals(selected.providerKey)) registerUnifiedPush(call, request, selected);
                    else {
                        try {
                            PushActivation.save(getContext(), selected);
                            registerFcm(call, request, selected, true);
                        } catch (RuntimeException unavailable) {
                            failActivation(getContext(), selected);
                            call.reject("PUSH_DEVICE_STORAGE_UNAVAILABLE");
                        }
                    }
                }
            });
        }
    }

    private void registerUnifiedPush(PluginCall call, int request, PushActivation selected) {
        // Removing the last connector instance removes its saved distributor.
        // Always retire before selection, including when changing API instances.
        UnifiedPush.tryUseCurrentOrDefaultDistributor(getActivity(), success -> {
            synchronized (PushActivation.class) {
                if (!isCurrentEnable(call, request)) { call.reject("PUSH_REQUEST_CANCELLED"); return Unit.INSTANCE; }
                if (!success) { call.reject("NO_PUSH_DISTRIBUTOR"); return Unit.INSTANCE; }
                try {
                    PushActivation.save(getContext(), selected);
                    UnifiedPush.register(getContext(), selected.activationId, "eimir.", call.getString("vapidPublicKey"));
                    pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
                    call.resolve();
                } catch (RuntimeException failed) {
                    if (PushActivation.current(getContext(), selected)) clearOwnership(selected);
                    call.reject("PUSH_REGISTRATION_FAILED");
                }
                return Unit.INSTANCE;
            }
        });
    }

    private void registerFcm(PluginCall call, int request, PushActivation selected, boolean enable) {
        int registration = fcmRegistrations.incrementAndGet();
        FcmRegistrationQueue.get(getContext()).register(() -> PushActivation.current(getContext(), selected)).addOnCompleteListener(result -> {
            synchronized (PushActivation.class) {
                if (registration != fcmRegistrations.get() || !PushActivation.current(getContext(), selected)) {
                    call.reject("PUSH_REQUEST_CANCELLED"); return;
                }
                if (!result.isSuccessful() || result.getResult() == null || !result.getResult().matches("[A-Za-z0-9_-]{22}")) {
                    clearOwnership(selected);
                    retire(selected);
                    call.reject("PUSH_REGISTRATION_FAILED"); return;
                }
                if (!saveFcmEndpoint(getContext(), selected, result.getResult())) {
                    call.reject("PUSH_DEVICE_STORAGE_UNAVAILABLE"); return;
                }
                // Receipt outlives a destroyed Activity. Persist before deciding
                // whether this particular bridge call can still resolve.
                if (request != registrationRequests.get()) { call.reject("PUSH_REQUEST_CANCELLED"); return; }
                if (enable) {
                    pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
                    call.resolve();
                } else call.resolve(new JSObject().put("enabled", true));
            }
        });
    }

    @PluginMethod public void refresh(PluginCall call) {
        synchronized (PushActivation.class) {
            PushActivation selected;
            try { selected = configuration(call); }
            catch (Exception invalid) { call.reject("INVALID_PUSH_CONFIGURATION"); return; }
            if (!PushActivation.current(getContext(), selected)) { call.resolve(new JSObject().put("enabled", false)); return; }
            if ("fcm".equals(selected.providerKey)) {
                registerFcm(call, registrationRequests.get(), selected, false);
            } else if (UnifiedPush.getAckDistributor(getContext()) == null) {
                call.resolve(new JSObject().put("enabled", false));
            } else {
                try {
                    UnifiedPush.register(getContext(), selected.activationId, "eimir.", call.getString("vapidPublicKey"));
                    if (selected.endpointValue != null) emit("endpoint", selected, selected.endpointValue, true);
                    call.resolve(new JSObject().put("enabled", true));
                } catch (RuntimeException failed) { call.reject("PUSH_REGISTRATION_FAILED"); }
            }
        }
    }

    private boolean clearOwnership(PushActivation previous) {
        synchronized (PushActivation.class) {
            if (!PushActivation.current(getContext(), previous)) return true;
            boolean saved = !"fcm".equals(previous.providerKey) || PushActivation.cleanupPending(getContext(), true);
            try { PushActivation.clear(getContext()); }
            catch (RuntimeException unavailable) { saved = false; }
            finally { NativePushNotifications.cancel(getContext()); }
            return saved;
        }
    }

    private Task<Void> cleanupPending() {
        return PushActivation.cleanupPending(getContext()) ? FcmRegistrationQueue.get(getContext()).retire() : Tasks.forResult(null);
    }

    private Task<Void> retire(PushActivation previous) {
        if (previous != null && "unifiedpush".equals(previous.providerKey)) UnifiedPush.unregister(getContext(), previous.activationId);
        return previous != null && "fcm".equals(previous.providerKey)
            ? FcmRegistrationQueue.get(getContext()).retire() : cleanupPending();
    }

    @PluginMethod public void disable(PluginCall call) {
        synchronized (PushActivation.class) {
            registrationRequests.incrementAndGet();
            pendingEnableCallId.set(null);
            PushActivation previous = PushActivation.read(getContext());
            boolean cleared = previous == null || clearOwnership(previous);
            NativePushNotifications.cancel(getContext());
            retire(previous).addOnCompleteListener(result -> {
                if (!cleared) call.reject("PUSH_DEVICE_STORAGE_UNAVAILABLE");
                else if (result.isSuccessful()) call.resolve();
                else call.reject("PUSH_DEVICE_CLEANUP_PENDING");
            });
        }
    }

    @PluginMethod public void openNotificationSettings(PluginCall call) {
        try {
            getContext().startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (RuntimeException unavailable) { call.reject("NOTIFICATION_SETTINGS_UNAVAILABLE"); }
    }

    private static void emit(String event, PushActivation activation, String value, boolean retain) {
        NativePushBridge plugin = current.get();
        if (plugin == null) return;
        JSObject data = scope(activation);
        if ("endpoint".equals(event)) data.put("endpointValue", value);
        if ("unavailable".equals(event)) data.put("reason", value);
        if ("notificationOpen".equals(event) && value != null) data.put("notificationId", value);
        plugin.notifyListeners(event, data, retain);
    }

    static void endpoint(Context context, PushEndpoint endpoint, String instance) {
        synchronized (PushActivation.class) {
            PushActivation active = PushActivation.read(context);
            if (active == null || !"unifiedpush".equals(active.providerKey) || !active.activationId.equals(instance)) return;
            PublicKeySet keys = endpoint.getPubKeySet();
            if (keys == null) { unavailable(context, instance, "WEB_PUSH_KEYS_UNAVAILABLE"); return; }
            try {
                String value = new JSONObject().put("endpoint", endpoint.getUrl()).put("keys",
                new JSONObject().put("p256dh", keys.getPubKey()).put("auth", keys.getAuth()))
                    .put("notificationReferenceVersion", 1).toString();
                PushActivation updated = active.withEndpoint(value);
                PushActivation.save(context, updated);
                emit("endpoint", updated, value, true);
            } catch (JSONException | RuntimeException invalid) {
                failActivation(context, active);
                emit("unavailable", active, "PUSH_DEVICE_STORAGE_UNAVAILABLE", true);
            }
        }
    }

    private static boolean saveFcmEndpoint(Context context, PushActivation active, String fid) {
        synchronized (PushActivation.class) {
            if (!PushActivation.current(context, active)) return false;
            try {
                String value = new JSONObject().put("fid", fid).put("activationId", active.activationId).toString();
                PushActivation updated = active.withEndpoint(value);
                PushActivation.save(context, updated);
                // Keep the shared key out of plaintext activation preferences.
                // Only this transient authenticated-registration event carries it.
                if (active.apiBaseUrl.startsWith("https://")) {
                    value = new JSONObject(value).put("previewVersion", 1)
                        .put("previewKey", PushPreviewKeys.registrationKey(context, active)).toString();
                }
                emit("endpoint", updated, value, true);
                return true;
            } catch (Exception invalid) {
                failActivation(context, active);
                emit("unavailable", active, "PUSH_DEVICE_STORAGE_UNAVAILABLE", true);
                return false;
            }
        }
    }

    private static void failActivation(Context context, PushActivation active) {
        synchronized (PushActivation.class) {
            if (!PushActivation.current(context, active)) return;
            if ("fcm".equals(active.providerKey)) PushActivation.cleanupPending(context, true);
            try { PushActivation.clear(context); } catch (RuntimeException unavailable) {
                // SharedPreferences updates local memory even if disk commit fails.
            }
            NativePushNotifications.cancel(context);
            if ("fcm".equals(active.providerKey)) FcmRegistrationQueue.get(context).retire();
            else {
                try { UnifiedPush.unregister(context, active.activationId); } catch (RuntimeException unavailable) { }
            }
        }
    }

    public static void fcmRegistered(Context context, String fid) {
        PushActivation active = PushActivation.read(context);
        if (active != null && "fcm".equals(active.providerKey)
            && !PushActivation.cleanupPending(context) && fid != null && fid.matches("[A-Za-z0-9_-]{22}")) {
            // A delayed callback can carry a retired FID. Confirm it against the
            // SDK's current installation without recursively registering again.
            FcmRegistrationQueue.get(context).identity(() -> PushActivation.current(context, active))
                .addOnCompleteListener(result -> {
                    if (!result.isSuccessful() || !fid.equals(result.getResult())) return;
                    synchronized (PushActivation.class) {
                        if (!PushActivation.current(context, active)) return;
                        PushActivation latest = PushActivation.read(context);
                        try {
                            if (latest.endpointValue != null && fid.equals(new JSONObject(latest.endpointValue).optString("fid"))) return;
                        } catch (JSONException invalid) {
                            failActivation(context, latest);
                            return;
                        }
                        saveFcmEndpoint(context, active, fid);
                    }
            });
        }
    }

    public static void fcmUnregistered(Context context, String fid) {
        synchronized (PushActivation.class) {
            PushActivation active = PushActivation.read(context);
            if (active == null || !"fcm".equals(active.providerKey) || active.endpointValue == null) return;
            try {
                if (!fid.equals(new JSONObject(active.endpointValue).optString("fid"))) return;
                PushActivation.save(context, active.withEndpoint(null));
                emit("unavailable", active, "UNREGISTERED", true);
            } catch (JSONException | RuntimeException invalid) {
                failActivation(context, active);
                emit("unavailable", active, "PUSH_DEVICE_STORAGE_UNAVAILABLE", true);
            }
        }
    }

    static void wake(Context context, PushActivation active) {
        if (PushActivation.current(context, active)) emit("wake", active, null, false);
    }

    static void unavailable(Context context, String instance, String reason) {
        PushActivation active = PushActivation.read(context);
        if (active != null && "unifiedpush".equals(active.providerKey) && active.activationId.equals(instance)) {
            emit("unavailable", active, reason, true);
        }
    }

    @Override protected void handleOnDestroy() {
        registrationRequests.incrementAndGet();
        pendingEnableCallId.set(null);
        if (current.get() == this) current.clear();
        super.handleOnDestroy();
    }
}
