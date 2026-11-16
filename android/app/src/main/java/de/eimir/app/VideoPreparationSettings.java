package de.eimir.app;

import android.media.MediaCodecInfo.CodecProfileLevel;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.container.NalUnitUtil;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/** Shared native upload bounds; no upscaling or portrait crop. */
@androidx.annotation.OptIn(markerClass = UnstableApi.class)
final class VideoPreparationSettings {
    final int width;
    final int height;
    final int bitrate;

    static boolean supportsAvcProfile(int profile) {
        // Profile values are identifiers, not an ordered bit-depth scale.
        // Older extractors can omit the profile; the server still validates it.
        return switch (profile) {
            case 0, CodecProfileLevel.AVCProfileBaseline, CodecProfileLevel.AVCProfileMain,
                CodecProfileLevel.AVCProfileExtended, CodecProfileLevel.AVCProfileHigh,
                CodecProfileLevel.AVCProfileConstrainedBaseline,
                CodecProfileLevel.AVCProfileConstrainedHigh -> true;
            default -> false;
        };
    }

    static boolean supportsPqMastering(ByteBuffer metadata) {
        // Media3's OpenGL PQ mapper clamps at 1,000 nits. Unknown or higher
        // mastering must retain the original selection instead of losing detail.
        if (metadata == null || metadata.remaining() < 25) return false;
        ByteBuffer info = metadata.duplicate().slice().order(ByteOrder.LITTLE_ENDIAN);
        if (info.get(0) != 0) return false;
        int mastering = Short.toUnsignedInt(info.getShort(17));
        int content = Short.toUnsignedInt(info.getShort(21));
        int peak = Math.max(mastering, content);
        return peak > 0 && peak <= 1000;
    }

    static boolean supportsPqMastering(ByteBuffer metadata, ByteBuffer codecData) {
        // MP4 extractors may expose mastering only in HEVC's Annex-B codec data.
        if (metadata != null) return supportsPqMastering(metadata);
        if (codecData == null || codecData.remaining() > 65_536) return false;
        byte[] data = new byte[codecData.remaining()];
        codecData.duplicate().get(data);
        double peak = 0;
        int start = NalUnitUtil.findNalUnit(data, 0, data.length, new boolean[3]);
        while (start + 5 < data.length) {
            int next = NalUnitUtil.findNalUnit(data, start + 3, data.length, new boolean[3]);
            int type = NalUnitUtil.getH265NalUnitType(data, start);
            if (type == NalUnitUtil.H265_NAL_UNIT_TYPE_PREFIX_SEI
                    || type == NalUnitUtil.H265_NAL_UNIT_TYPE_SUFFIX_SEI) {
                if (next < start + 5) return false;
                byte[] sei = Arrays.copyOfRange(data, start + 5, next);
                int limit = NalUnitUtil.unescapeStream(sei, sei.length);
                int position = 0;
                while (position + 1 < limit) {
                    int payloadType = 0, size = 0, value;
                    do {
                        if (position >= limit) return false;
                        value = sei[position++] & 255; payloadType += value;
                    } while (value == 255);
                    do {
                        if (position >= limit) return false;
                        value = sei[position++] & 255; size += value;
                    } while (value == 255);
                    if (size > limit - position) return false;
                    ByteBuffer payload = ByteBuffer.wrap(sei, position, size).slice();
                    if (payloadType == 137) { // SMPTE ST 2086: 0.0001-nit units.
                        if (size != 24) return false;
                        peak = Math.max(peak, Integer.toUnsignedLong(payload.getInt(16)) / 10_000.0);
                    } else if (payloadType == 144) { // CTA-861.3 MaxCLL: nit units.
                        if (size != 4) return false;
                        peak = Math.max(peak, Short.toUnsignedInt(payload.getShort(0)));
                    }
                    if (peak > 1000) return false;
                    position += size;
                }
            }
            start = next;
        }
        return peak > 0;
    }

    VideoPreparationSettings(int width, int height) {
        if (Math.min(width, height) <= 0 || Math.max(width, height) > 3840 || Math.min(width, height) > 2160)
            throw new IllegalArgumentException("Invalid video dimensions");
        double scale = Math.min(1, Math.min(1920.0 / Math.max(width, height), 1080.0 / Math.min(width, height)));
        this.width = Math.max(2, (int) (width * scale / 2) * 2);
        this.height = Math.max(2, (int) (height * scale / 2) * 2);
        bitrate = Math.max(1_500_000, (int) (10_000_000L * this.width * this.height / (1920 * 1080)));
    }
}
