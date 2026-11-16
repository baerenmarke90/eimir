package de.eimir.app;

import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.SecretKey;

/**
 * Framing for the per-login key that seals media bytes in the WebView store.
 * The key file is wrapped by the same Android Keystore key as the session
 * snapshot, under its own associated data so neither envelope can stand in
 * for the other. Deleting the file makes every stored media item unreadable.
 */
final class DeviceMediaKey {
    static final int KEY_BYTES = 32;
    private static final String CONTEXT = "\u0000device-media-key-v1";

    private DeviceMediaKey() {}

    static String generate() {
        byte[] raw = new byte[KEY_BYTES];
        new SecureRandom().nextBytes(raw);
        try {
            return Base64.getEncoder().encodeToString(raw);
        } finally {
            Arrays.fill(raw, (byte) 0);
        }
    }

    static byte[] seal(SecretKey wrapping, String instance, String value)
            throws GeneralSecurityException {
        requireKey(value);
        return NativeSessionCipher.encrypt(wrapping, instance + CONTEXT, value);
    }

    static String open(SecretKey wrapping, String instance, byte[] envelope)
            throws GeneralSecurityException {
        String value = NativeSessionCipher.decrypt(wrapping, instance + CONTEXT, envelope);
        requireKey(value);
        return value;
    }

    private static void requireKey(String value) throws GeneralSecurityException {
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException invalid) {
            throw new GeneralSecurityException("Invalid media key");
        }
        int length = raw.length;
        Arrays.fill(raw, (byte) 0);
        if (length != KEY_BYTES) throw new GeneralSecurityException("Invalid media key");
    }
}
