package de.eimir.app;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Platform AES/GCM framing; the production key remains in Android Keystore. */
final class NativeSessionCipher {
    static final int MAX_PLAINTEXT_BYTES = 16_384;
    static final int MAX_ENVELOPE_BYTES = MAX_PLAINTEXT_BYTES + 30;

    static byte[] encrypt(SecretKey key, String instance, String value)
            throws GeneralSecurityException {
        byte[] plaintext = value.getBytes(StandardCharsets.UTF_8);
        if (plaintext.length > MAX_PLAINTEXT_BYTES) {
            throw new GeneralSecurityException("Session snapshot exceeds its bound");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(instance.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        if (iv.length != 12) throw new GeneralSecurityException("Unsupported IV length");
        byte[] encrypted = cipher.doFinal(plaintext);
        return ByteBuffer.allocate(2 + iv.length + encrypted.length)
                .put((byte) 1).put((byte) iv.length).put(iv).put(encrypted).array();
    }

    static String decrypt(SecretKey key, String instance, byte[] envelope)
            throws GeneralSecurityException {
        if (envelope.length < 30 || envelope.length > MAX_ENVELOPE_BYTES
                || envelope[0] != 1 || envelope[1] != 12) {
            throw new GeneralSecurityException("Invalid session envelope");
        }
        byte[] iv = new byte[12];
        System.arraycopy(envelope, 2, iv, 0, iv.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        cipher.updateAAD(instance.getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(envelope, 14, envelope.length - 14),
                StandardCharsets.UTF_8);
    }
}
