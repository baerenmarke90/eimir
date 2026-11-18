package de.eimir.app;

import android.content.Context;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.FrameDropEffect;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.EditedMediaItemSequence;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Platform codecs/tone mapping, never a raw-file or server-encoding fallback. */
@androidx.annotation.OptIn(markerClass = UnstableApi.class)
final class NativeVideoPreparation {
    private static final long TIMEOUT_MS = 600_000;
    private static int integer(MediaFormat format, String key, int fallback) {
        return format.containsKey(key) ? format.getInteger(key) : fallback;
    }

    static final class Metadata {
        MediaFormat video;
        MediaFormat audio;
        int width;
        int height;
        long durationUs;

        boolean compatible() {
            int transfer = integer(video, MediaFormat.KEY_COLOR_TRANSFER, 3);
            int profile = integer(video, MediaFormat.KEY_PROFILE, 0);
            return MimeTypes.VIDEO_H264.equals(video.getString(MediaFormat.KEY_MIME))
                && transfer != 6 && transfer != 7 && VideoPreparationSettings.supportsAvcProfile(profile)
                && Math.max(width, height) <= 1920 && Math.min(width, height) <= 1080
                && (audio == null || MimeTypes.AUDIO_AAC.equals(audio.getString(MediaFormat.KEY_MIME)));
        }
    }

    static Metadata inspect(File source) throws IOException {
        Metadata result = new Metadata();
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(source.getAbsolutePath());
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String type = format.getString(MediaFormat.KEY_MIME);
                if (type != null && type.startsWith("video/")) {
                    if (result.video != null) throw new IOException("Multiple video tracks");
                    result.video = format;
                } else if (type != null && type.startsWith("audio/")) {
                    if (result.audio != null) throw new IOException("Multiple audio tracks");
                    result.audio = format;
                }
                if (type != null && (type.startsWith("video/") || type.startsWith("audio/"))) {
                    long duration = format.containsKey(MediaFormat.KEY_DURATION) ? format.getLong(MediaFormat.KEY_DURATION) : 0;
                    if (duration <= 0 || duration > 180_000_000) throw new IOException("Invalid video duration");
                    result.durationUs = Math.max(result.durationUs, duration);
                }
            }
            if (result.video == null) throw new IOException("Missing video track");
            String codec = result.video.getString(MediaFormat.KEY_MIME);
            if (!MimeTypes.VIDEO_H264.equals(codec) && !MimeTypes.VIDEO_H265.equals(codec))
                throw new IOException("Unsupported video codec");
            int rotation = integer(result.video, MediaFormat.KEY_ROTATION, 0);
            if (rotation % 90 != 0) throw new IOException("Invalid video orientation");
            result.width = result.video.getInteger(MediaFormat.KEY_WIDTH);
            result.height = result.video.getInteger(MediaFormat.KEY_HEIGHT);
            if (Math.abs(rotation % 180) == 90) {
                int width = result.width; result.width = result.height; result.height = width;
            }
            new VideoPreparationSettings(result.width, result.height);
            return result;
        } catch (RuntimeException invalid) {
            throw new IOException("Video could not be inspected");
        } finally { extractor.release(); }
    }

    static BackgroundMediaTransfers.Record prepare(Context context, BackgroundMediaTransfers.Record record,
            CancellationSignal cancellation) throws Exception {
        File source = BackgroundMediaTransfers.source(context, record.id());
        Metadata original = inspect(source);
        VideoPreparationSettings settings = new VideoPreparationSettings(original.width, original.height);
        cancellation.throwIfCanceled();
        if (integer(original.video, MediaFormat.KEY_COLOR_TRANSFER, 3) == MediaFormat.COLOR_TRANSFER_ST2084
                && !VideoPreparationSettings.supportsPqMastering(
                    original.video.getByteBuffer(MediaFormat.KEY_HDR_STATIC_INFO), original.video.getByteBuffer("csd-0")))
            throw new IOException("HDR preparation is unavailable for this recording");
        if (original.compatible() && source.length() * 8.0 * 1_000_000 / original.durationUs <= settings.bitrate)
            return BackgroundMediaTransfers.prepared(context, record.id(), source);
        File output = BackgroundMediaTransfers.preparationOutput(context, record.id());
        HandlerThread thread = new HandlerThread("eimir-video-preparation");
        thread.start();
        Handler handler = new Handler(thread.getLooper());
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Exception> error = new AtomicReference<>();
        AtomicReference<Transformer> active = new AtomicReference<>();
        long deadline = SystemClock.elapsedRealtime() + TIMEOUT_MS;
        try {
            handler.post(() -> {
                try {
                    cancellation.throwIfCanceled();
                    DefaultEncoderFactory encoders = new DefaultEncoderFactory.Builder(context)
                        .setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(settings.bitrate).build())
                        .setEnableFallback(false).build();
                    Transformer transformer = new Transformer.Builder(context).setLooper(thread.getLooper())
                        .setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
                        .setEncoderFactory(encoders).setUsePlatformDiagnostics(false)
                        .addListener(new Transformer.Listener() {
                            @Override public void onCompleted(Composition composition, ExportResult result) { completed.countDown(); }
                            @Override public void onError(Composition composition, ExportResult result, ExportException failure) {
                                // Stable categories aid diagnosis without logging codec messages or source URIs.
                                error.set(new IOException("On-device video preparation failed: " + failure.getErrorCodeName()));
                                completed.countDown();
                            }
                        }).build();
                    active.set(transformer);
                    EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(source)))
                        .setEffects(new Effects(Collections.emptyList(), Arrays.asList(
                            Presentation.createForWidthAndHeight(settings.width, settings.height, Presentation.LAYOUT_SCALE_TO_FIT),
                            FrameDropEffect.createDefaultFrameDropEffect(30))))
                        .build();
                    EditedMediaItemSequence sequence = original.audio == null
                        ? EditedMediaItemSequence.withVideoFrom(Collections.singletonList(item))
                        : EditedMediaItemSequence.withAudioAndVideoFrom(Collections.singletonList(item));
                    Composition composition = new Composition.Builder(sequence)
                        .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL).build();
                    transformer.start(composition, output.getAbsolutePath());
                } catch (Exception failure) { error.set(new IOException("On-device video preparation failed")); completed.countDown(); }
            });
            while (!completed.await(250, TimeUnit.MILLISECONDS)) {
                cancellation.throwIfCanceled();
                BackgroundMediaTransfers.requireActive(context, record.id());
                BackgroundMediaTransfers.session(context, record.instance(), record.account(), record.space());
                if (SystemClock.elapsedRealtime() >= deadline || output.length() > BackgroundMediaTransfers.MAX_FILE)
                    throw new IOException("Video preparation exceeded its resource budget");
            }
            cancellation.throwIfCanceled();
            if (error.get() != null) throw error.get();
            Metadata prepared = inspect(output);
            if (!prepared.compatible() || (original.audio == null) != (prepared.audio == null)
                    || Math.abs(original.durationUs - prepared.durationUs) > 250_000)
                throw new IOException("Prepared video did not preserve the recording");
            return BackgroundMediaTransfers.prepared(context, record.id(), output);
        } finally {
            CountDownLatch released = new CountDownLatch(1);
            handler.post(() -> {
                try { if (active.get() != null) active.get().cancel(); }
                finally { released.countDown(); }
            });
            released.await(5, TimeUnit.SECONDS);
            thread.quitSafely();
            output.delete();
        }
    }
}
