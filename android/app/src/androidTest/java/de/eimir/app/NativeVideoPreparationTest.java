package de.eimir.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaCodecList;
import android.media.MediaMetadataRetriever;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import android.util.Log;
import androidx.media3.common.util.GlUtil;
import androidx.media3.common.util.UnstableApi;
import androidx.core.content.FileProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.time.Instant;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;

/** Actual platform encoding and private staged-file handoff, without a network mock codec. */
@androidx.annotation.OptIn(markerClass = UnstableApi.class)
public class NativeVideoPreparationTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final String instance = "https://video-preparation.eimir.invalid";
    private final String account = UUID.randomUUID().toString();
    private final String space = UUID.randomUUID().toString();
    private final String id = UUID.randomUUID().toString();
    private final String attachment = UUID.randomUUID().toString();
    private SelectedMediaProvider.Owner selection;
    private File original;

    private BackgroundMediaTransfers.Record stage(String fixture) throws Exception {
        JSONObject snapshot = new JSONObject().put("account", new JSONObject().put("id", account)).put("spaceId", space)
            .put("tokens", new JSONObject().put("accessToken", "synthetic").put("accessExpiresAt", Instant.now().plusSeconds(600).toString()));
        AtomicFile target = NativeSessionStoragePlugin.file(context, instance);
        FileOutputStream session = target.startWrite();
        session.write(NativeSessionCipher.encrypt(NativeSessionStoragePlugin.key(), instance, snapshot.toString())); target.finishWrite(session);
        original = new File(context.getCacheDir(), "synthetic-video-preparation.mp4");
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("video-preparation/" + fixture);
                FileOutputStream output = new FileOutputStream(original)) {
            byte[] buffer = new byte[64 * 1024]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        selection = new SelectedMediaProvider.Owner();
        Uri uri = selection.adopt(context, FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", original));
        String name;
        try (Cursor cursor = context.getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            assertNotNull(cursor); assertTrue(cursor.moveToFirst()); name = cursor.getString(0);
        }
        return BackgroundMediaTransfers.stage(context, instance, account, space, id, name, original.length(), "video/mp4", new CancellationSignal());
    }
    @After public void cleanup() throws Exception {
        BackgroundMediaTransfers.cancel(context, id); BackgroundMediaTransfers.cancel(context, attachment);
        NativeSessionStoragePlugin.clearSnapshot(context, instance);
        if (selection != null) selection.close();
        if (original != null) original.delete();
    }
    @Test public void compatibleRecordingRemainsLosslessAndHandsOffExactPreparedSize() throws Exception {
        BackgroundMediaTransfers.Record record = stage("video-with-metadata.mp4");
        byte[] bytes = Files.readAllBytes(original.toPath());
        BackgroundMediaTransfers.Record prepared = NativeVideoPreparation.prepare(context, record, new CancellationSignal());
        assertEquals("prepared", prepared.phase()); assertEquals(bytes.length, prepared.value.getLong("size"));
        assertArrayEquals(bytes, Files.readAllBytes(BackgroundMediaTransfers.source(context, id).toPath()));
        try { BackgroundMediaTransfers.adoptPrepared(context, instance, account, space, id, attachment, bytes.length + 1); fail("Incorrect reservation size must fail"); }
        catch (java.io.IOException expected) { assertTrue(BackgroundMediaTransfers.source(context, id).exists()); }
        BackgroundMediaTransfers.Record adopted = BackgroundMediaTransfers.adoptPrepared(context, instance, account, space, id, attachment, bytes.length);
        assertEquals("uploading", adopted.phase()); assertEquals("video/mp4", adopted.value.getString("mimeType"));
        assertFalse(BackgroundMediaTransfers.source(context, id).exists());
        assertArrayEquals(bytes, Files.readAllBytes(BackgroundMediaTransfers.source(context, attachment).toPath()));
        String parent = UUID.randomUUID().toString();
        BackgroundMediaTransfers.bindTarget(context, instance, account, space, attachment, "MEMORY", parent);
        BackgroundMediaTransfers.update(context, attachment, "uploading", 50);
        BackgroundMediaTransfers.Record progress = BackgroundMediaTransfers.read(context, attachment);
        com.getcapacitor.JSObject opened = BackgroundMediaTransfers.openTarget(context,
            BackgroundMediaTransfers.notificationIntent(context, progress));
        assertEquals("The prepared transfer opens its confirmed parent", parent, opened.getString("targetId"));
        assertEquals("MEMORY", opened.getString("targetType"));
        assertEquals("The adopted Attachment owns the notice, not its staging identity", attachment,
            opened.getString("attachmentId"));
    }
    @Test public void highResolutionVideoIsEncodedLocallyWithoutChangingAspectOrSound() throws Exception {
        BackgroundMediaTransfers.Record record = stage("high-resolution-avc.mp4");
        BackgroundMediaTransfers.Record prepared = NativeVideoPreparation.prepare(context, record, new CancellationSignal());
        NativeVideoPreparation.Metadata info = NativeVideoPreparation.inspect(BackgroundMediaTransfers.source(context, id));
        assertTrue(info.compatible()); assertEquals(1920, info.width); assertEquals(1080, info.height);
        assertEquals(1_000_000, info.durationUs, 100_000);
        assertNotNull(info.audio);
        assertEquals(BackgroundMediaTransfers.source(context, id).length(), prepared.value.getLong("size"));
        assertFalse(BackgroundMediaTransfers.preparationOutput(context, id).exists());
    }
    @Test public void hdrIsToneMappedOnDeviceAndCannotBecomeAnUnprocessedFallback() throws Exception {
        toneMapAndCheck("hlg-highlight-steps.mp4");
        cleanup();
        toneMapAndCheck("pq-mastered-steps.mp4");
        cleanup();
        BackgroundMediaTransfers.Record unbounded = stage("pq-highlight-steps.mp4");
        try {
            NativeVideoPreparation.prepare(context, unbounded, new CancellationSignal());
            fail("Unknown or 10,000-nit PQ must not silently clip at Media3's 1,000-nit limit");
        } catch (java.io.IOException expected) {
            assertEquals("preparing", BackgroundMediaTransfers.read(context, id).phase());
            assertTrue(BackgroundMediaTransfers.source(context, id).exists());
        }
    }
    private void toneMapAndCheck(String fixture) throws Exception {
        BackgroundMediaTransfers.Record record = stage(fixture);
        NativeVideoPreparation.Metadata input = NativeVideoPreparation.inspect(original);
        assertFalse(input.compatible());
        assertEquals("The fixture must contain actual HDR, not relabelled SDR",
            fixture.startsWith("hlg") ? MediaFormat.COLOR_TRANSFER_HLG : MediaFormat.COLOR_TRANSFER_ST2084,
            input.video.getInteger(MediaFormat.KEY_COLOR_TRANSFER));
        if (fixture.startsWith("pq") && Build.VERSION.SDK_INT >= 29) {
            assertTrue("The native PQ fixture declares supported 1,000-nit mastering",
                VideoPreparationSettings.supportsPqMastering(
                    input.video.getByteBuffer(MediaFormat.KEY_HDR_STATIC_INFO), input.video.getByteBuffer("csd-0")));
        }
        // API level alone does not promise Media3's HDR input capabilities.
        // Match the upstream HDR test contract using the actual GL extension
        // and platform decoder query. Unsupported devices still execute the
        // real preparation and must retain the original without a raw fallback.
        boolean yuv = Build.VERSION.SDK_INT >= 29 && GlUtil.isYuvTargetExtensionSupported();
        boolean decoder = Build.VERSION.SDK_INT >= 29
            && new MediaCodecList(MediaCodecList.REGULAR_CODECS).findDecoderForFormat(input.video) != null;
        Log.i("EimirVideoPreparationFixture", "HDR input capabilities: api=" + Build.VERSION.SDK_INT
            + ", yuv=" + yuv + ", decoder=" + decoder);
        if (!yuv || !decoder) {
            try {
                NativeVideoPreparation.prepare(context, record, new CancellationSignal());
                fail("Unsupported HDR input must fail instead of becoming an unprocessed fallback");
            } catch (java.io.IOException expected) {
                assertEquals("preparing", BackgroundMediaTransfers.read(context, id).phase());
                assertArrayEquals("Unsupported HDR keeps every original byte",
                    Files.readAllBytes(original.toPath()),
                    Files.readAllBytes(BackgroundMediaTransfers.source(context, id).toPath()));
                assertFalse("Failed HDR cannot leave an encoded output",
                    BackgroundMediaTransfers.preparationOutput(context, id).exists());
            }
            return;
        }
        NativeVideoPreparation.prepare(context, record, new CancellationSignal());
        File output = BackgroundMediaTransfers.source(context, id);
        assertTrue(NativeVideoPreparation.inspect(output).compatible());
        try (MediaMetadataRetriever retriever = new MediaMetadataRetriever()) {
            retriever.setDataSource(output.getAbsolutePath());
            Bitmap frame = retriever.getFrameAtTime(500_000, MediaMetadataRetriever.OPTION_CLOSEST);
            assertNotNull(frame);
            try {
                int[] levels = new int[8];
                for (int i = 0; i < 8; i++) {
                    int pixel = frame.getPixel((2 * i + 1) * frame.getWidth() / 16, frame.getHeight() / 2);
                    int red = (pixel >> 16) & 255, green = (pixel >> 8) & 255, blue = pixel & 255;
                    assertTrue(Math.abs(red - green) <= 5 && Math.abs(red - blue) <= 5); levels[i] = red;
                }
                assertTrue(levels[0] <= 5);
                // The source gray is 18 nits; Media3's SDR reference white is
                // 500 nits. This also rejects unconverted HDR electrical values.
                int gray = (int) Math.round(255 * Math.pow(18.0 / 500, 1.0 / 2.2));
                assertTrue("18-nit gray retains the SDR reference exposure", Math.abs(levels[2] - gray) <= 15);
                for (int i = 1; i < 8; i++) assertTrue("Neutral highlight steps must remain distinct", levels[i] > levels[i - 1]);
                assertTrue(levels[7] - levels[5] >= 7);
            } finally { frame.recycle(); }
        }
    }
    @Test public void cancelledPreparationNeverMarksAnOriginalAsPrepared() throws Exception {
        BackgroundMediaTransfers.Record record = stage("video-with-metadata.mp4");
        CancellationSignal cancellation = new CancellationSignal(); cancellation.cancel();
        try { NativeVideoPreparation.prepare(context, record, cancellation); fail("Cancellation must win"); }
        catch (android.os.OperationCanceledException expected) { assertEquals("preparing", BackgroundMediaTransfers.read(context, id).phase()); }
        BackgroundMediaTransfers.cancel(context, id);
        assertFalse(BackgroundMediaTransfers.source(context, id).exists());
    }
}
