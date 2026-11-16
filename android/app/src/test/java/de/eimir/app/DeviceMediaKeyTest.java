package de.eimir.app;

import static org.junit.Assert.*;
import java.security.GeneralSecurityException;
import java.util.Base64;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.Test;

public class DeviceMediaKeyTest {
    private static final String INSTANCE = "https://instance.example";

    private SecretKey wrapping() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        return generator.generateKey();
    }

    @Test public void generatesDistinct256BitKeysThatRoundTrip() throws Exception {
        SecretKey wrapping = wrapping();
        String first = DeviceMediaKey.generate();
        assertNotEquals(first, DeviceMediaKey.generate());
        assertEquals(32, Base64.getDecoder().decode(first).length);
        assertEquals(first, DeviceMediaKey.open(wrapping, INSTANCE, DeviceMediaKey.seal(wrapping, INSTANCE, first)));
    }

    @Test(expected = GeneralSecurityException.class)
    public void mediaKeyEnvelopeIsNotASessionSnapshot() throws Exception {
        SecretKey wrapping = wrapping();
        byte[] envelope = DeviceMediaKey.seal(wrapping, INSTANCE, DeviceMediaKey.generate());
        NativeSessionCipher.decrypt(wrapping, INSTANCE, envelope);
    }

    @Test(expected = GeneralSecurityException.class)
    public void sessionSnapshotIsNotAMediaKey() throws Exception {
        SecretKey wrapping = wrapping();
        byte[] envelope = NativeSessionCipher.encrypt(wrapping, INSTANCE, DeviceMediaKey.generate());
        DeviceMediaKey.open(wrapping, INSTANCE, envelope);
    }

    @Test(expected = GeneralSecurityException.class)
    public void mediaKeyCannotMoveToAnotherInstance() throws Exception {
        SecretKey wrapping = wrapping();
        byte[] envelope = DeviceMediaKey.seal(wrapping, INSTANCE, DeviceMediaKey.generate());
        DeviceMediaKey.open(wrapping, "https://other.example", envelope);
    }

    @Test(expected = GeneralSecurityException.class)
    public void rejectsAKeyOfTheWrongLength() throws Exception {
        DeviceMediaKey.seal(wrapping(), INSTANCE, Base64.getEncoder().encodeToString(new byte[16]));
    }
}
