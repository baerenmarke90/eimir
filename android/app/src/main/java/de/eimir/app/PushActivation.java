package de.eimir.app;

import android.content.Context;
import org.json.JSONException;
import org.json.JSONObject;

/** One local receipt owner; provider callbacks never supply Account or API ownership. */
final class PushActivation {
    private static final String PREFS = "eimir_native_push";
    final String accountId;
    final String apiBaseUrl;
    final String providerKey;
    final String activationId;
    final String endpointValue;

    PushActivation(String accountId, String apiBaseUrl, String providerKey, String activationId, String endpointValue) {
        this.accountId = accountId;
        this.apiBaseUrl = apiBaseUrl;
        this.providerKey = providerKey;
        this.activationId = activationId;
        this.endpointValue = endpointValue;
    }

    PushActivation withEndpoint(String endpoint) {
        return new PushActivation(accountId, apiBaseUrl, providerKey, activationId, endpoint);
    }

    boolean owns(String account, String api, String provider) {
        return accountId.equals(account) && apiBaseUrl.equals(api) && providerKey.equals(provider);
    }

    static synchronized PushActivation read(Context context) {
        try {
            String value = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("activation", null);
            if (value == null) return null;
            JSONObject json = new JSONObject(value);
            return new PushActivation(json.getString("accountId"), json.getString("apiBaseUrl"),
                json.getString("providerKey"), json.getString("activationId"), json.optString("endpointValue", null));
        } catch (JSONException | RuntimeException invalid) {
            try { clear(context); } catch (RuntimeException unavailable) { }
            return null;
        }
    }

    static synchronized void save(Context context, PushActivation activation) {
        try {
            JSONObject value = new JSONObject().put("accountId", activation.accountId)
                .put("apiBaseUrl", activation.apiBaseUrl).put("providerKey", activation.providerKey)
                .put("activationId", activation.activationId).put("endpointValue", activation.endpointValue);
            if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString("activation", value.toString()).commit()) throw new IllegalStateException("PUSH_STORAGE_UNAVAILABLE");
        } catch (JSONException invalid) {
            throw new IllegalStateException("INVALID_PUSH_CONFIGURATION");
        }
    }

    static synchronized void clear(Context context) {
        if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("activation").commit()) {
            throw new IllegalStateException("PUSH_STORAGE_UNAVAILABLE");
        }
    }

    static synchronized boolean current(Context context, PushActivation expected) {
        PushActivation active = read(context);
        return active != null && expected != null && active.activationId.equals(expected.activationId)
            && active.owns(expected.accountId, expected.apiBaseUrl, expected.providerKey);
    }

    static boolean cleanupPending(Context context) {
        try {
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("fcm_cleanup_pending", false);
        } catch (RuntimeException invalid) { return true; }
    }

    static boolean cleanupPending(Context context, boolean pending) {
        try {
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("fcm_cleanup_pending", pending).commit();
        } catch (RuntimeException unavailable) { return false; }
    }
}
