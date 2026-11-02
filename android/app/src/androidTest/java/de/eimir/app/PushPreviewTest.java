package de.eimir.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.util.Base64;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.json.JSONObject;
import org.junit.Test;

/** Interoperability against an envelope actually produced by the Python sender. */
public class PushPreviewTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private byte[] fixtureKey() {
        byte[] key = new byte[32];
        for (int i = 0; i < key.length; i++) key[i] = (byte) i;
        return key;
    }

    private JSONObject fixture() throws Exception {
        try (java.io.InputStream input = InstrumentationRegistry.getInstrumentation().getContext()
                .getAssets().open("push-preview-v1.json")) {
            return new JSONObject(new String(readAsset(input), StandardCharsets.UTF_8));
        }
    }

    @Test public void pythonJweDecryptsIntoLocalizedReminderAndKiss() throws Exception {
        JSONObject fixture = fixture();
        PushActivation active = activation(fixture.getString("activationId"));
        byte[] key = fixtureKey();
        PushPreview reminder = PushPreview.decrypt(active, fixture.getJSONArray("cases").getJSONObject(0).getString("jwe"), key, 1100);
        PushPreview kiss = PushPreview.decrypt(active, fixture.getJSONArray("cases").getJSONObject(1).getString("jwe"), key, 1100);
        assertNotNull(reminder);
        assertNotNull(kiss);
        assertEquals("Alex hat die Erinnerung „Einkaufen“ erstellt.", reminder.body(context));
        assertEquals("Erinnerung ansehen", reminder.action(context));
        assertEquals("Alex hat dir einen Kuss geschickt.", kiss.body(context));
    }

    @Test public void wrongKeyActivationExpiryAlterationAndOversizeAreRejected() throws Exception {
        JSONObject fixture = fixture();
        PushActivation active = activation(fixture.getString("activationId"));
        byte[] key = fixtureKey();
        String compact = fixture.getJSONArray("cases").getJSONObject(0).getString("jwe");
        assertNull(PushPreview.decrypt(active, compact, new byte[32], 1100));
        assertNull(PushPreview.decrypt(activation("a2f26945-d3dc-4269-83ca-3fef46f90d34"), compact, key, 1100));
        assertNull(PushPreview.decrypt(active, compact, key, 1300));
        int point = compact.lastIndexOf('.') - 3;
        String changed = compact.substring(0, point) + (compact.charAt(point) == 'A' ? 'B' : 'A') + compact.substring(point + 1);
        assertNull(PushPreview.decrypt(active, changed, key, 1100));
        char[] huge = new char[3001];
        Arrays.fill(huge, 'a');
        assertNull(PushPreview.decrypt(active, new String(huge), key, 1100));
    }

    @Test public void aFutureAuthorizedKindKeepsItsSafeGenericWakeWithoutLeakingUnknownFields() throws Exception {
        JSONObject fixture = fixture();
        PushPreview preview = PushPreview.decrypt(activation(fixture.getString("activationId")),
            fixture.getJSONArray("cases").getJSONObject(2).getString("jwe"), fixtureKey(), 1100);
        assertNotNull(preview);
        assertEquals(context.getString(R.string.push_notification_body), preview.body(context));
        assertNull(preview.action(context));
    }

    @Test public void deviceKeyIsWrappedBoundToOwnerAndDeletedOnRetirement() throws Exception {
        PushActivation active = activation("b751cb5a-b266-4f10-a6b2-782f71bf92fb");
        Class<?> keys = Class.forName("de.eimir.app.PushPreviewKeys", true, context.getClassLoader());
        java.lang.reflect.Method clear = keys.getDeclaredMethod("clear", Context.class);
        java.lang.reflect.Method registration = keys.getDeclaredMethod("registrationKey", Context.class, PushActivation.class);
        clear.setAccessible(true); registration.setAccessible(true);
        clear.invoke(null, context);
        try {
            String value = (String) registration.invoke(null, context, active);
            java.io.File file = new java.io.File(context.getNoBackupFilesDir(), "eimir-push-preview-key");
            assertFalse(new String(java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).contains(value));
            assertEquals(value, registration.invoke(null, context, active));
            PushActivation other = new PushActivation("0f94bddd-bede-4676-a343-7202f117fef9", active.apiBaseUrl,
                "fcm", active.activationId, null);
            try { registration.invoke(null, context, other); fail("A new Account cannot reuse a preview key"); }
            catch (java.lang.reflect.InvocationTargetException rejected) { assertNotNull(rejected.getCause()); }
            PushActivation.save(context, active);
            PushActivation.clear(context);
            assertFalse(file.exists());
        } finally { clear.invoke(null, context); PushActivation.clear(context); }
    }

    private PushActivation activation(String id) {
        return new PushActivation("17b4a730-e98c-4af3-b19e-5fae9485200c", "https://api.example.invalid", "fcm", id, null);
    }
    private static byte[] readAsset(java.io.InputStream input) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[512];
        for (int count; (count = input.read(chunk)) != -1;) {
            if (output.size() + count > 4096) throw new IllegalStateException("Fixture exceeds its bound");
            output.write(chunk, 0, count);
        }
        return output.toByteArray();
    }

}
