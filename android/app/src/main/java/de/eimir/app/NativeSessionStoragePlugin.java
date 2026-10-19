package de.eimir.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
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

    private AtomicFile file(String instance) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(instance.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder("eimir-session-");
        for (byte value : digest) name.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), name.toString()));
    }

    private SecretKey key() throws Exception {
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

    @PluginMethod
    public void read(PluginCall call) {
        io.execute(() -> {
            AtomicFile snapshot = null;
            try {
                String instance = instance(call);
                snapshot = file(instance);
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
                snapshot = file(instance);
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
                AtomicFile snapshot = file(instance(call));
                snapshot.delete();
                if (snapshot.getBaseFile().exists()) throw new Exception("Session deletion failed");
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
