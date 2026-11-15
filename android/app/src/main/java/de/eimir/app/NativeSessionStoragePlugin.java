package de.eimir.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.content.Context;
import org.json.JSONObject;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** A bounded credential slot per instance, never a native product-data cache. */
@CapacitorPlugin(name = "NativeSessionStorage")
public class NativeSessionStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "eimir_native_session_v1";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private String instance(PluginCall call) throws Exception {
        String value = call.getString("instance");
        if (value == null || value.length() > 2048) throw new Exception("Invalid instance");
        URI uri = new URI(value);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new Exception("Invalid instance");
        }
        return value;
    }

    static AtomicFile file(Context context, String instance) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(instance.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder("eimir-session-");
        for (byte value : digest) name.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return new AtomicFile(new File(context.getNoBackupFilesDir(), name.toString()));
    }

    static synchronized SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    static JSONObject snapshot(Context context, String instance) throws Exception {
        AtomicFile snapshot = file(context, instance);
        if (snapshot.getBaseFile().length() > NativeSessionCipher.MAX_ENVELOPE_BYTES)
            throw new Exception("Session snapshot exceeds its bound");
        return new JSONObject(NativeSessionCipher.decrypt(key(), instance, snapshot.readFully()));
    }

    static void clearSnapshot(Context context, String instance) throws Exception {
        AtomicFile snapshot = file(context, instance);
        try {
            try { BackgroundMediaTransfers.cancelInstance(context, instance); }
            finally { PresenceBackground.disableForInstance(context, instance); }
        }
        finally { snapshot.delete(); }
        if (snapshot.getBaseFile().exists()) throw new Exception("Session deletion failed");
    }

    @PluginMethod
    public void read(PluginCall call) {
        io.execute(() -> {
            AtomicFile snapshot = null;
            try {
                String instance = instance(call);
                snapshot = file(getContext(), instance);
                if (snapshot.getBaseFile().length() > NativeSessionCipher.MAX_ENVELOPE_BYTES) {
                    throw new Exception("Session snapshot exceeds its bound");
                }
                byte[] envelope = snapshot.readFully();
                String value = NativeSessionCipher.decrypt(key(), instance, envelope);
                call.resolve(new JSObject().put("value", value));
            } catch (FileNotFoundException absent) {
                call.resolve(new JSObject());
            } catch (Exception unavailable) {
                if (snapshot != null) snapshot.delete();
                call.reject("Secure session storage unavailable", "NATIVE_SESSION_STORAGE_UNAVAILABLE");
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        io.execute(() -> {
            AtomicFile snapshot = null;
            FileOutputStream output = null;
            try {
                String instance = instance(call);
                String value = call.getString("value");
                if (value == null) throw new Exception("Missing session snapshot");
                byte[] envelope = NativeSessionCipher.encrypt(key(), instance, value);
                snapshot = file(getContext(), instance);
                try {
                    JSONObject previous = snapshot(getContext(), instance);
                    JSONObject next = new JSONObject(value);
                    if (!previous.getJSONObject("account").getString("id").equals(next.getJSONObject("account").getString("id"))
                            || !previous.optString("spaceId").equals(next.optString("spaceId")))
                        BackgroundMediaTransfers.cancelInstance(getContext(), instance);
                } catch (FileNotFoundException absent) {
                    // First session for this instance has no previous owner.
                }
                output = snapshot.startWrite();
                output.write(envelope);
                snapshot.finishWrite(output);
                call.resolve();
            } catch (Exception unavailable) {
                if (snapshot != null && output != null) snapshot.failWrite(output);
                call.reject("Secure session storage unavailable", "NATIVE_SESSION_STORAGE_UNAVAILABLE");
            }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        io.execute(() -> {
            try {
                String instance = instance(call);
                clearSnapshot(getContext(), instance);
                call.resolve();
            } catch (Exception unavailable) {
                call.reject("Secure session storage unavailable", "NATIVE_SESSION_STORAGE_UNAVAILABLE");
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
        super.handleOnDestroy();
    }
}
