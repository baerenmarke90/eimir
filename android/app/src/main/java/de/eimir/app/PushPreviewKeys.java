package de.eimir.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** One per-activation JWE key, wrapped by AndroidKeyStore in no-backup storage. */
final class PushPreviewKeys {
    private static final String ALIAS = "eimir_push_preview_wrap_v1";
    private static final int BASE64 = Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING;

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "eimir-push-preview-key"));
    }

    private static String binding(PushActivation activation) {
        return activation.activationId + "|" + activation.accountId + "|" + activation.apiBaseUrl + "|" + activation.providerKey;
    }

    private static SecretKey wrappingKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    static byte[] read(Context context, PushActivation activation) throws Exception {
        AtomicFile snapshot = file(context);
        if (snapshot.getBaseFile().length() > 512) throw new IllegalStateException("PUSH_PREVIEW_KEY_INVALID");
        String value = NativeSessionCipher.decrypt(wrappingKey(), binding(activation), snapshot.readFully());
        byte[] key = Base64.decode(value, BASE64);
        if (key.length != 32 || !Base64.encodeToString(key, BASE64).equals(value))
            throw new IllegalStateException("PUSH_PREVIEW_KEY_INVALID");
        return key;
    }

    static String registrationKey(Context context, PushActivation activation) throws Exception {
        AtomicFile snapshot = file(context);
        if (snapshot.getBaseFile().exists()) return Base64.encodeToString(read(context, activation), BASE64);
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String value = Base64.encodeToString(bytes, BASE64);
        byte[] encrypted = NativeSessionCipher.encrypt(wrappingKey(), binding(activation), value);
        FileOutputStream output = snapshot.startWrite();
        try { output.write(encrypted); snapshot.finishWrite(output); }
        catch (Exception failure) { snapshot.failWrite(output); throw failure; }
        return value;
    }

    static void clear(Context context) {
        AtomicFile snapshot = file(context);
        snapshot.delete();
        if (snapshot.getBaseFile().exists()) throw new IllegalStateException("PUSH_PREVIEW_KEY_CLEANUP_FAILED");
    }
}
