package de.eimir.app;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import kotlin.Unit;
import org.unifiedpush.android.connector.UnifiedPush;
import org.unifiedpush.android.connector.data.PushEndpoint;
import org.unifiedpush.android.connector.data.PublicKeySet;

/** The authenticated Web app owns server writes; native code only talks to the distributor. */
@CapacitorPlugin(
    name = "EimirUnifiedPush",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public final class UnifiedPushBridge extends Plugin {
    private static final String PREFS = "eimir_unified_push";
    private static final String ACTIVE_INSTANCE = "active_account";
    private static WeakReference<UnifiedPushBridge> current = new WeakReference<>(null);
    private final AtomicInteger registrationRequests = new AtomicInteger();
    private final AtomicReference<String> pendingEnableCallId = new AtomicReference<>();

    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    static String activeInstance(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ACTIVE_INSTANCE, null);
    }

    private void setActiveInstance(String instance) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(ACTIVE_INSTANCE, instance).apply();
    }

    private void clearActiveInstance() {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(ACTIVE_INSTANCE).apply();
    }

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState("notifications") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        String active = activeInstance(getContext());
        result.put("accountId", active);
        result.put("enabled", active != null && UnifiedPush.getAckDistributor(getContext()) != null);
        result.put("permissionGranted", notificationsAllowed());
        call.resolve(result);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        int request = registrationRequests.incrementAndGet();
        pendingEnableCallId.set(call.getCallbackId());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsAllowed()) {
            requestPermissionForAlias("notifications", call, "permissionResult");
            return;
        }
        selectAndRegister(call, request);
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        int request = registrationRequests.get();
        if (!isCurrentEnable(call, request)) {
            call.reject("PUSH_REQUEST_CANCELLED");
            return;
        }
        if (notificationsAllowed()) {
            selectAndRegister(call, request);
        } else {
            pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
            call.reject("NOTIFICATION_PERMISSION_DENIED");
        }
    }

    private boolean isCurrentEnable(PluginCall call, int request) {
        return request == registrationRequests.get() && call.getCallbackId().equals(pendingEnableCallId.get());
    }

    private void selectAndRegister(PluginCall call, int request) {
        String accountId = call.getString("accountId");
        String vapid = call.getString("vapidPublicKey");
        try {
            if (accountId == null || vapid == null || vapid.length() != 87) {
                throw new IllegalArgumentException();
            }
            UUID.fromString(accountId);
        } catch (IllegalArgumentException error) {
            pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
            call.reject("INVALID_PUSH_CONFIGURATION");
            return;
        }
        UnifiedPush.tryUseCurrentOrDefaultDistributor(getActivity(), success -> {
            if (!isCurrentEnable(call, request)) {
                call.reject("PUSH_REQUEST_CANCELLED");
                return Unit.INSTANCE;
            }
            if (!success) {
                pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
                call.reject("NO_PUSH_DISTRIBUTOR");
                return Unit.INSTANCE;
            }
            String previous = activeInstance(getContext());
            if (previous != null && !previous.equals(accountId)) {
                UnifiedPush.unregister(getContext(), previous);
            }
            setActiveInstance(accountId);
            try {
                UnifiedPush.register(getContext(), accountId, "eimir.", vapid);
                pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
                call.resolve();
            } catch (RuntimeException error) {
                clearActiveInstance();
                pendingEnableCallId.compareAndSet(call.getCallbackId(), null);
                call.reject("PUSH_REGISTRATION_FAILED");
            }
            return Unit.INSTANCE;
        });
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        String accountId = call.getString("accountId");
        String vapid = call.getString("vapidPublicKey");
        if (accountId == null || !accountId.equals(activeInstance(getContext())) || vapid == null) {
            call.resolve(new JSObject().put("enabled", false));
            return;
        }
        if (UnifiedPush.getAckDistributor(getContext()) == null) {
            call.resolve(new JSObject().put("enabled", false));
            return;
        }
        try {
            UnifiedPush.register(getContext(), accountId, "eimir.", vapid);
            call.resolve(new JSObject().put("enabled", true));
        } catch (RuntimeException error) {
            call.reject("PUSH_REGISTRATION_FAILED");
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        registrationRequests.incrementAndGet();
        pendingEnableCallId.set(null);
        String previous = activeInstance(getContext());
        clearActiveInstance();
        if (previous != null) {
            UnifiedPush.unregister(getContext(), previous);
        }
        call.resolve();
    }

    static void endpoint(Context context, PushEndpoint endpoint, String instance) {
        if (!instance.equals(activeInstance(context))) return;
        PublicKeySet keys = endpoint.getPubKeySet();
        if (keys == null) {
            unavailable(context, instance, "WEB_PUSH_KEYS_UNAVAILABLE");
            return;
        }
        UnifiedPushBridge plugin = current.get();
        if (plugin == null) return;
        JSObject result = new JSObject();
        result.put("accountId", instance);
        result.put("endpoint", endpoint.getUrl());
        result.put("p256dh", keys.getPubKey());
        result.put("auth", keys.getAuth());
        plugin.notifyListeners("endpoint", result, true);
    }

    static void wake(Context context, String instance) {
        if (!instance.equals(activeInstance(context))) return;
        UnifiedPushBridge plugin = current.get();
        if (plugin != null) plugin.notifyListeners("wake", new JSObject());
    }

    static void unavailable(Context context, String instance, String reason) {
        if (!instance.equals(activeInstance(context))) return;
        UnifiedPushBridge plugin = current.get();
        if (plugin == null) return;
        JSObject result = new JSObject();
        result.put("reason", reason);
        plugin.notifyListeners("unavailable", result, true);
    }
}
