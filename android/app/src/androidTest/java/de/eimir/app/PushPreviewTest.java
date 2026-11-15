package de.eimir.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.res.Configuration;
import android.util.Base64;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Locale;
import com.nimbusds.jose.JWEObject;
import com.nimbusds.jose.JWEHeader;
import com.nimbusds.jose.JWEAlgorithm;
import com.nimbusds.jose.EncryptionMethod;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.DirectEncrypter;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** Interoperability against an envelope actually produced by the Python sender. */
public class PushPreviewTest {
    private final Context context = localized("de");

    private Context localized(String language) {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Configuration configuration = new Configuration(target.getResources().getConfiguration());
        configuration.setLocale(Locale.forLanguageTag(language));
        return target.createConfigurationContext(configuration);
    }

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

    @Test public void completeSenderCatalogHasConcreteLocalizedContentAndCanonicalActions() throws Exception {
        JSONObject catalog;
        try (java.io.InputStream input = InstrumentationRegistry.getInstrumentation().getContext()
                .getAssets().open("push-preview-catalog.json")) {
            catalog = new JSONObject(new String(readAsset(input), StandardCharsets.UTF_8));
        }
        JSONArray cases = catalog.getJSONArray("cases");
        PushActivation active = activation(catalog.getString("activationId"));
        for (int index = 0; index < cases.length(); index++) {
            JSONObject sample = cases.getJSONObject(index);
            PushPreview preview = PushPreview.decrypt(active, sample.getString("jwe"), fixtureKey(), 1100);
            assertNotNull(sample.getString("id"), preview);
            for (String language : new String[] {"de", "en"}) {
                Context locale = localized(language);
                assertEquals(sample.getString("id") + ": " + language,
                    sample.getJSONObject("expectedBody").getString(language), preview.body(locale));
                JSONObject actions = sample.getJSONObject("expectedAction");
                assertEquals(actions.isNull(language) ? null : actions.getString(language), preview.action(locale));
            }
        }
    }

    @Test public void contentIsStrictlyVersionedBoundedAndCannotEscapeThroughUnknownKinds() throws Exception {
        JSONObject value = new JSONObject()
            .put("v", 2).put("notificationId", "01a19706-45b8-741d-a0d2-3687565a6789")
            .put("kind", "COMMENT_CREATED").put("name", "Alex").put("title", "Our walk")
            .put("targetType", "MEMORY").put("digest", false).put("issuedAt", 1000).put("expiresAt", 1300)
            .put("body", "The actual comment");
        PushActivation active = activation(fixture().getString("activationId"));
        assertNotNull(PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100));
        value.put("v", 1);
        assertNull(PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100));
        value.put("v", 3);
        assertNull(PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100));
        value.put("v", 2).put("body", "Invisible\u202econtent");
        assertNull(PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100));
        value.put("body", new String(new char[181]).replace('\0', 'x'));
        assertNull(PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100));
        value.put("body", "Never display unknown content").put("kind", "FUTURE_REVIEWED_EVENT");
        PushPreview unknown = PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100);
        assertNotNull(unknown);
        assertEquals(context.getString(R.string.push_notification_body), unknown.body(context));
        assertNull(unknown.action(context));
        value.put("kind", "THINKING_OF_YOU");
        PushPreview gesture = PushPreview.decrypt(active, encrypt(active, value), fixtureKey(), 1100);
        assertNotNull(gesture);
        assertFalse(gesture.body(context).contains("Never display"));
    }

    private String encrypt(PushActivation active, JSONObject value) throws Exception {
        JWEObject encrypted = new JWEObject(new JWEHeader.Builder(JWEAlgorithm.DIR, EncryptionMethod.A256GCM)
            .type(new JOSEObjectType("eimir-push-preview+jwe")).keyID(active.activationId).build(), new Payload(value.toString()));
        encrypted.encrypt(new DirectEncrypter(fixtureKey()));
        return encrypted.serialize();
    }

    private PushActivation activation(String id) {
        return new PushActivation("17b4a730-e98c-4af3-b19e-5fae9485200c", "https://api.example.invalid", "fcm", id, null);
    }
    private static byte[] readAsset(java.io.InputStream input) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[512];
        for (int count; (count = input.read(chunk)) != -1;) {
            if (output.size() + count > 131072) throw new IllegalStateException("Fixture exceeds its bound");
            output.write(chunk, 0, count);
        }
        return output.toByteArray();
    }

}
