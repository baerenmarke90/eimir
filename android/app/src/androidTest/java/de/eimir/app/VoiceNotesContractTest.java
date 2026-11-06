package de.eimir.app;

import static org.junit.Assert.*;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import org.junit.Test;
import android.webkit.WebView;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Real Android share admission and revocable, bounded audio descriptor leases. */
public class VoiceNotesContractTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void audioShareResolvesToThePermanentActivity() throws Exception {
        Intent share = new Intent(Intent.ACTION_SEND).setType("audio/ogg").setPackage(context.getPackageName());
        assertFalse(context.getPackageManager().queryIntentActivities(share, PackageManager.MATCH_DEFAULT_ONLY).isEmpty());
        String[] permissions = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
        assertTrue(java.util.Arrays.asList(permissions).contains(Manifest.permission.RECORD_AUDIO));
    }

    @Test public void selectedAudioHasIndependentReadersAndIsRevokedOnOwnerClose() throws Exception {
        File file = new File(context.getCacheDir(), "voice-note-lease.wav");
        byte[] bytes = {82, 73, 70, 70, 1, 2, 3, 4};
        Files.write(file.toPath(), bytes);
        Uri original = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        SelectedMediaProvider.Owner owner = new SelectedMediaProvider.Owner();
        Uri selected = owner.adoptAudio(context, original);
        try {
            assertEquals(context.getPackageName() + ".selectedmedia", selected.getAuthority());
            assertTrue(context.getContentResolver().getType(selected).startsWith("audio/"));
            try (InputStream first = context.getContentResolver().openInputStream(selected);
                 InputStream second = context.getContentResolver().openInputStream(selected)) {
                assertEquals(82, first.read()); assertEquals(73, first.read()); assertEquals(82, second.read());
            }
            owner.close();
            try (InputStream invalid = context.getContentResolver().openInputStream(selected)) {
                fail("A released voice lease must be unreadable");
            } catch (java.io.FileNotFoundException expected) { /* Revocation is immediate. */ }
        } finally { owner.close(); file.delete(); }
    }

    @Test public void oversizedAudioIsNeverAdopted() throws Exception {
        File file = new File(context.getCacheDir(), "oversized-voice.wav");
        try (RandomAccessFile output = new RandomAccessFile(file, "rw")) { output.setLength(20L * 1024 * 1024 + 1); }
        Uri original = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        try (SelectedMediaProvider.Owner owner = new SelectedMediaProvider.Owner()) {
            assertEquals(original, owner.adoptAudio(context, original));
        } finally { file.delete(); }
    }
    private String evaluate(WebView view, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            view.evaluateJavascript(script, result -> { value.set(result); done.countDown(); }));
        assertTrue("The renderer must answer", done.await(5, TimeUnit.SECONDS));
        Object decoded = new JSONTokener(value.get()).nextValue();
        return decoded == JSONObject.NULL ? "" : decoded.toString();
    }

    private JSONObject nativeCall(WebView view, String method, JSONObject options) throws Exception {
        evaluate(view, "window.__voiceResult = ''; window.Capacitor.nativePromise('VoiceShare', '"
            + method + "', " + options.toString() + ").then(value => window.__voiceResult = JSON.stringify(value || {}))"
            + ".catch(() => window.__voiceResult = JSON.stringify({failed:true})); 'started'");
        long deadline = SystemClock.elapsedRealtime() + 5000;
        while (SystemClock.elapsedRealtime() < deadline) {
            String value = evaluate(view, "window.__voiceResult || ''");
            if (!value.isEmpty()) return new JSONObject(value);
            SystemClock.sleep(50);
        }
        throw new AssertionError("Native voice call did not complete");
    }

    @Test public void coldShareCrossesTheRealBridgeAndCannotReplayAfterRecreation() throws Exception {
        File file = new File(context.getCacheDir(), "shared-voice.wav");
        Files.write(file.toPath(), new byte[] {82, 73, 70, 70, 1, 2, 3, 4});
        Uri original = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        Intent incoming = new Intent(context, LauncherActivity.class).setAction(Intent.ACTION_SEND)
            .setType("audio/wav").putExtra(Intent.EXTRA_STREAM, original)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(incoming)) {
            AtomicReference<WebView> web = new AtomicReference<>();
            scenario.onActivity(activity -> web.set(activity.getBridge().getWebView()));
            long deadline = SystemClock.elapsedRealtime() + 10000;
            while (!"function".equals(evaluate(web.get(), "window.Capacitor && typeof window.Capacitor.nativePromise"))
                    && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
            JSONObject pending = null;
            while (SystemClock.elapsedRealtime() < deadline) {
                pending = nativeCall(web.get(), "peek", new JSONObject());
                if (pending.optBoolean("available")) break;
                SystemClock.sleep(50);
            }
            assertNotNull(pending);
            assertTrue("Cold share must reach the native bridge", pending.optBoolean("available"));
            JSONObject ticket = new JSONObject().put("generation", pending.getString("generation"));
            JSONObject media = nativeCall(web.get(), "read", ticket);
            Uri selected = Uri.parse(media.getString("uri"));
            assertEquals(context.getPackageName() + ".selectedmedia", selected.getAuthority());
            try (InputStream bytes = context.getContentResolver().openInputStream(selected)) { assertEquals(82, bytes.read()); }
            nativeCall(web.get(), "discard", ticket);
            assertFalse(nativeCall(web.get(), "peek", new JSONObject()).getBoolean("available"));
            scenario.recreate();
            scenario.onActivity(activity -> web.set(activity.getBridge().getWebView()));
            deadline = SystemClock.elapsedRealtime() + 10000;
            while (!"function".equals(evaluate(web.get(), "window.Capacitor && typeof window.Capacitor.nativePromise"))
                    && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
            assertFalse("Consumed Intent must never replay", nativeCall(web.get(), "peek", new JSONObject()).getBoolean("available"));
        } finally { file.delete(); }
    }

}
