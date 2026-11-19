package de.eimir.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.Bridge;
import java.io.File;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;

/** Real Android share admission, the WishShare bridge, and revocable, bounded photo leases. */
public class WishShareContractTest {
    private static final byte[] PNG_HEADER = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private boolean resolves(Intent share) {
        return !context.getPackageManager().queryIntentActivities(
            share.setPackage(context.getPackageName()), PackageManager.MATCH_DEFAULT_ONLY).isEmpty();
    }

    @Test public void textAndImageSharesResolveToThePermanentActivity() {
        assertTrue(resolves(new Intent(Intent.ACTION_SEND).setType("text/plain")));
        assertTrue(resolves(new Intent(Intent.ACTION_SEND).setType("image/png")));
        assertTrue(resolves(new Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/png")));
        // The voice filter is unchanged; WishShare never claims audio.
        assertTrue(resolves(new Intent(Intent.ACTION_SEND).setType("audio/ogg")));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify("audio/ogg"));
        // Multiple text and unrelated types are not claimed.
        assertFalse(resolves(new Intent(Intent.ACTION_SEND_MULTIPLE).setType("text/plain")));
        assertFalse(resolves(new Intent(Intent.ACTION_SEND).setType("application/pdf")));
    }

    private File pngFile(String name) throws Exception {
        File file = new File(context.getCacheDir(), name);
        Files.write(file.toPath(), PNG_HEADER);
        return file;
    }

    private Uri provide(File file) {
        return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
    }

    @Test public void selectedImageIsLeasedReadOnlyAndRevokedOnOwnerClose() throws Exception {
        File file = pngFile("wish-photo-lease.png");
        Uri original = provide(file);
        SelectedMediaProvider.Owner owner = new SelectedMediaProvider.Owner();
        Uri selected = owner.adoptImage(context, original);
        try {
            assertEquals(context.getPackageName() + ".selectedmedia", selected.getAuthority());
            assertEquals("image/png", context.getContentResolver().getType(selected));
            try (Cursor cursor = context.getContentResolver().query(selected, null, null, null, null)) {
                assertTrue(cursor.moveToFirst());
                assertEquals("image", cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)));
                assertEquals(PNG_HEADER.length, cursor.getLong(cursor.getColumnIndexOrThrow(OpenableColumns.SIZE)));
            }
            try (InputStream first = context.getContentResolver().openInputStream(selected);
                 InputStream second = context.getContentResolver().openInputStream(selected)) {
                assertEquals(0x89, first.read()); assertEquals(0x50, first.read()); assertEquals(0x89, second.read());
            }
            owner.close();
            try (InputStream invalid = context.getContentResolver().openInputStream(selected)) {
                fail("A released photo lease must be unreadable");
            } catch (java.io.FileNotFoundException expected) { /* Revocation is immediate. */ }
        } finally { owner.close(); file.delete(); }
    }

    @Test public void oversizedAndUnsupportedImagesAreNeverAdopted() throws Exception {
        File oversized = new File(context.getCacheDir(), "oversized-wish-photo.png");
        try (RandomAccessFile output = new RandomAccessFile(oversized, "rw")) {
            output.setLength(SelectedMediaProvider.MAX_SHARED_IMAGE_BYTES + 1);
        }
        File atLimit = new File(context.getCacheDir(), "limit-wish-photo.jpg");
        try (RandomAccessFile output = new RandomAccessFile(atLimit, "rw")) {
            output.setLength(SelectedMediaProvider.MAX_SHARED_IMAGE_BYTES);
        }
        File gif = new File(context.getCacheDir(), "unsupported-wish-photo.gif");
        Files.write(gif.toPath(), new byte[] {71, 73, 70});
        File text = new File(context.getCacheDir(), "not-a-photo.txt");
        Files.write(text.toPath(), new byte[] {1, 2, 3});
        try (SelectedMediaProvider.Owner owner = new SelectedMediaProvider.Owner()) {
            Uri tooBig = provide(oversized);
            assertEquals(tooBig, owner.adoptImage(context, tooBig));
            Uri limit = owner.adoptImage(context, provide(atLimit));
            assertEquals("The exact limit is still accepted",
                context.getPackageName() + ".selectedmedia", limit.getAuthority());
            Uri animated = provide(gif);
            assertEquals(animated, owner.adoptImage(context, animated));
            Uri notImage = provide(text);
            assertEquals(notImage, owner.adoptImage(context, notImage));
        } finally { oversized.delete(); atLimit.delete(); gif.delete(); text.delete(); }
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

    /** A rejected native call resolves to {rejected:true}, so it is distinguishable from a peek result. */
    private JSONObject nativeCall(WebView view, String method, JSONObject options) throws Exception {
        evaluate(view, "window.__wishResult = ''; window.Capacitor.nativePromise('WishShare', '"
            + method + "', " + options.toString() + ").then(value => window.__wishResult = JSON.stringify(value || {}))"
            + ".catch(() => window.__wishResult = JSON.stringify({rejected:true})); 'started'");
        long deadline = SystemClock.elapsedRealtime() + 5000;
        while (SystemClock.elapsedRealtime() < deadline) {
            String value = evaluate(view, "window.__wishResult || ''");
            if (!value.isEmpty()) return new JSONObject(value);
            SystemClock.sleep(50);
        }
        throw new AssertionError("Native wish call did not complete");
    }

    /** Below the WebView floor Capacitor shows a static notice without the bridge (#1931); load the app document. */
    private static WebView appDocumentWebView(LauncherActivity activity) {
        Bridge bridge = activity.getBridge();
        WebView view = bridge.getWebView();
        if (!bridge.isMinimumWebViewInstalled()) view.loadUrl(bridge.getAppUrl());
        return view;
    }

    private WebView awaitBridge(ActivityScenario<LauncherActivity> scenario) throws Exception {
        AtomicReference<WebView> web = new AtomicReference<>();
        scenario.onActivity(activity -> web.set(appDocumentWebView(activity)));
        long deadline = SystemClock.elapsedRealtime() + 10000;
        while (!"function".equals(evaluate(web.get(), "window.Capacitor && typeof window.Capacitor.nativePromise"))
                && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
        return web.get();
    }

    /** Polls until a share is available (image adoption is asynchronous) or the timeout passes. */
    private JSONObject awaitPending(WebView web) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        JSONObject pending;
        do {
            pending = nativeCall(web, "peek", new JSONObject());
            if (pending.optBoolean("available") || pending.optBoolean("failed")) break;
            SystemClock.sleep(50);
        } while (SystemClock.elapsedRealtime() < deadline);
        return pending;
    }

    private Intent coldShare(String type, String text, Uri stream) {
        Intent incoming = new Intent(context, LauncherActivity.class).setAction(Intent.ACTION_SEND).setType(type);
        if (text != null) incoming.putExtra(Intent.EXTRA_TEXT, text);
        if (stream != null) incoming.putExtra(Intent.EXTRA_STREAM, stream).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return incoming;
    }

    @Test public void coldTextShareCrossesTheRealBridgeAndCannotReplayAfterRecreation() throws Exception {
        String link = "https://example.invalid/a-nice-lamp";
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(coldShare("text/plain", link, null))) {
            WebView web = awaitBridge(scenario);
            JSONObject pending = awaitPending(web);
            assertTrue("Cold text share must reach the native bridge", pending.optBoolean("available"));
            assertFalse(pending.optBoolean("failed"));
            assertEquals(link, pending.getString("text"));
            assertFalse(pending.getBoolean("hasImage"));
            assertEquals(0, pending.getInt("imageCount"));
            JSONObject ticket = new JSONObject().put("generation", pending.getString("generation"));
            assertTrue("No photo was shared", nativeCall(web, "read", ticket).optBoolean("rejected"));
            // Recreation without a discard must not replay the consumed Intent.
            scenario.recreate();
            web = awaitBridge(scenario);
            JSONObject replay = nativeCall(web, "peek", new JSONObject());
            assertFalse("Consumed Intent must never replay", replay.getBoolean("available"));
            assertTrue(replay.isNull("text"));
        }
    }

    @Test public void coldPhotoShareWithCaptionIsLeasedReadableAndDiscardable() throws Exception {
        File file = pngFile("shared-wish-photo.png");
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(
                coldShare("image/png", "Caption from the chat", provide(file)))) {
            WebView web = awaitBridge(scenario);
            JSONObject pending = awaitPending(web);
            assertTrue("Cold photo share must reach the native bridge", pending.optBoolean("available"));
            assertTrue(pending.getBoolean("hasImage"));
            assertEquals(1, pending.getInt("imageCount"));
            assertEquals("Caption from the chat", pending.getString("text"));
            JSONObject ticket = new JSONObject().put("generation", pending.getString("generation"));
            assertTrue("A stale generation is rejected",
                nativeCall(web, "read", new JSONObject().put("generation", "0")).optBoolean("rejected"));
            JSONObject media = nativeCall(web, "read", ticket);
            Uri selected = Uri.parse(media.getString("uri"));
            assertEquals("image/png", media.getString("mimeType"));
            assertEquals(context.getPackageName() + ".selectedmedia", selected.getAuthority());
            try (InputStream bytes = context.getContentResolver().openInputStream(selected)) { assertEquals(0x89, bytes.read()); }
            nativeCall(web, "discard", ticket);
            assertFalse(nativeCall(web, "peek", new JSONObject()).getBoolean("available"));
            try (InputStream gone = context.getContentResolver().openInputStream(selected)) {
                fail("A discarded photo lease must be unreadable");
            } catch (java.io.FileNotFoundException expected) { /* Revocation is immediate. */ }
            scenario.recreate();
            web = awaitBridge(scenario);
            assertFalse("Consumed Intent must never replay", nativeCall(web, "peek", new JSONObject()).getBoolean("available"));
        } finally { file.delete(); }
    }

    @Test public void aFailedPhotoKeepsTheSharedLinkUsable() throws Exception {
        File file = new File(context.getCacheDir(), "oversized-shared-wish-photo.png");
        try (RandomAccessFile output = new RandomAccessFile(file, "rw")) {
            output.setLength(SelectedMediaProvider.MAX_SHARED_IMAGE_BYTES + 1);
        }
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(
                coldShare("image/png", "https://example.invalid/lamp", provide(file)))) {
            WebView web = awaitBridge(scenario);
            JSONObject pending = awaitPending(web);
            assertTrue(pending.getBoolean("available"));
            assertTrue(pending.getBoolean("failed"));
            assertFalse(pending.getBoolean("hasImage"));
            assertEquals("https://example.invalid/lamp", pending.getString("text"));
        } finally { file.delete(); }
    }

    @Test public void aLaterShareReplacesThePendingOneAndMultiplePhotosUseTheFirst() throws Exception {
        File first = pngFile("multi-first.png");
        File second = pngFile("multi-second.png");
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(
                coldShare("text/plain", "https://example.invalid/first", null))) {
            WebView web = awaitBridge(scenario);
            JSONObject link = awaitPending(web);
            assertEquals("https://example.invalid/first", link.getString("text"));

            ArrayList<Uri> streams = new ArrayList<>();
            streams.add(provide(first)); streams.add(provide(second));
            Intent multiple = new Intent(context, LauncherActivity.class).setAction(Intent.ACTION_SEND_MULTIPLE)
                .setType("image/png").putParcelableArrayListExtra(Intent.EXTRA_STREAM, streams)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            scenario.onActivity(activity ->
                InstrumentationRegistry.getInstrumentation().callActivityOnNewIntent(activity, multiple));
            JSONObject photos = awaitPendingGeneration(web, link.getString("generation"));
            assertTrue(photos.getBoolean("hasImage"));
            assertEquals(2, photos.getInt("imageCount"));
            assertTrue("The earlier link was replaced", photos.isNull("text"));
            assertTrue("The replaced generation is gone",
                nativeCall(web, "read", new JSONObject().put("generation", link.getString("generation"))).optBoolean("rejected"));
        } finally { first.delete(); second.delete(); }
    }

    private JSONObject awaitPendingGeneration(WebView web, String previous) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        JSONObject pending;
        do {
            pending = awaitPending(web);
            if (!previous.equals(pending.getString("generation"))) break;
            SystemClock.sleep(50);
        } while (SystemClock.elapsedRealtime() < deadline);
        return pending;
    }

    @Test public void audioShareIsNeverHandledByWishShare() throws Exception {
        File file = new File(context.getCacheDir(), "wish-ignored-voice.wav");
        Files.write(file.toPath(), new byte[] {82, 73, 70, 70, 1, 2, 3, 4});
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(
                coldShare("audio/wav", null, provide(file)))) {
            WebView web = awaitBridge(scenario);
            SystemClock.sleep(500);
            JSONObject pending = nativeCall(web, "peek", new JSONObject());
            assertFalse(pending.getBoolean("available"));
            assertFalse(pending.getBoolean("failed"));
            assertFalse(pending.getBoolean("hasImage"));
        } finally { file.delete(); }
    }

    @Test public void aPhotoShareDoesNotRaiseAVoiceFailure() throws Exception {
        File file = pngFile("wish-not-voice.png");
        try (ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(
                coldShare("image/png", null, provide(file)))) {
            WebView web = awaitBridge(scenario);
            evaluate(web, "window.__voicePeek = ''; window.Capacitor.nativePromise('VoiceShare', 'peek', {})"
                + ".then(value => window.__voicePeek = JSON.stringify(value || {})); 'started'");
            long deadline = SystemClock.elapsedRealtime() + 5000;
            String value = "";
            while (value.isEmpty() && SystemClock.elapsedRealtime() < deadline) {
                value = evaluate(web, "window.__voicePeek || ''");
                if (value.isEmpty()) SystemClock.sleep(50);
            }
            JSONObject voice = new JSONObject(value);
            assertFalse(voice.getBoolean("available"));
            assertFalse("A photo share must not look like a failed voice note", voice.getBoolean("failed"));
        } finally { file.delete(); }
    }
}
