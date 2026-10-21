package de.eimir.app;

import static org.junit.Assert.*;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.Test;

public class NativeSessionCipherTest {
    private SecretKey key() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        return generator.generateKey();
    }

    @Test public void roundTripUsesRandomizedAuthenticatedEncryption() throws Exception {
        SecretKey key = key();
        byte[] first = NativeSessionCipher.encrypt(key, "https://instance.example", "private-refresh");
        byte[] second = NativeSessionCipher.encrypt(key, "https://instance.example", "private-refresh");
        assertFalse(Arrays.equals(first, second));
        assertEquals("private-refresh", NativeSessionCipher.decrypt(key, "https://instance.example", first));
    }

    @Test(expected = GeneralSecurityException.class)
    public void ciphertextCannotBeMovedToAnotherInstance() throws Exception {
        SecretKey key = key();
        byte[] value = NativeSessionCipher.encrypt(key, "https://first.example", "private-refresh");
        NativeSessionCipher.decrypt(key, "https://second.example", value);
    }

    @Test(expected = GeneralSecurityException.class)
    public void tamperingIsRejected() throws Exception {
        SecretKey key = key();
        byte[] value = NativeSessionCipher.encrypt(key, "https://instance.example", "private-refresh");
        value[value.length-1] ^= 1;
        NativeSessionCipher.decrypt(key, "https://instance.example", value);
    }

    @Test(expected = GeneralSecurityException.class)
    public void malformedEnvelopeIsRejected() throws Exception {
        NativeSessionCipher.decrypt(key(), "https://instance.example", new byte[3]);
    }
}
