package de.eimir.app;

import static org.junit.Assert.*;
import android.media.MediaCodecInfo.CodecProfileLevel;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;

public class VideoPreparationSettingsTest {
    private static ByteBuffer masteringSei(int nits, int contentPeak) {
        ByteBuffer payload = ByteBuffer.allocate(33);
        payload.put((byte) 137).put((byte) 24);
        payload.position(18); payload.putInt(nits * 10_000).putInt(50);
        payload.put((byte) 144).put((byte) 4).putShort((short) contentPeak).putShort((short) 400).put((byte) 128);
        ByteArrayOutputStream escaped = new ByteArrayOutputStream();
        escaped.writeBytes(new byte[] {0, 0, 0, 1, 78, 1});
        int zeros = 0;
        for (byte value : payload.array()) {
            if (zeros == 2 && (value & 255) <= 3) { escaped.write(3); zeros = 0; }
            escaped.write(value); zeros = value == 0 ? zeros + 1 : 0;
        }
        return ByteBuffer.wrap(escaped.toByteArray());
    }
    @Test public void readsBoundedPqMasteringFromEscapedHevcCodecDataWhenTrackMetadataIsAbsent() {
        ByteBuffer supported = masteringSei(1000, 1000);
        assertTrue(VideoPreparationSettings.supportsPqMastering(null, supported));
        assertEquals("Inspection must not consume platform codec data", 0, supported.position());
        assertFalse(VideoPreparationSettings.supportsPqMastering(null, masteringSei(4000, 1000)));
        assertFalse(VideoPreparationSettings.supportsPqMastering(null, masteringSei(1000, 4000)));
        assertFalse(VideoPreparationSettings.supportsPqMastering(null, masteringSei(0, 0)));
    }
    @Test public void rejectsMissingTruncatedAndUnboundedHevcMasteringData() {
        assertFalse(VideoPreparationSettings.supportsPqMastering(null, null));
        assertFalse(VideoPreparationSettings.supportsPqMastering(null, ByteBuffer.allocate(65_537)));
        ByteBuffer truncated = masteringSei(1000, 1000); truncated.limit(truncated.limit() - 4);
        assertFalse(VideoPreparationSettings.supportsPqMastering(null, truncated));
        ByteBuffer invalid = ByteBuffer.allocate(25).put(0, (byte) 1);
        assertFalse("Invalid explicit metadata must not be bypassed by codec data",
            VideoPreparationSettings.supportsPqMastering(invalid, masteringSei(1000, 1000)));
    }
    @Test public void rejectsUnknownOrOutOfRangePqMasteringInsteadOfClippingHighlights() {
        assertFalse(VideoPreparationSettings.supportsPqMastering(null));
        assertFalse(VideoPreparationSettings.supportsPqMastering(ByteBuffer.allocate(24)));
        ByteBuffer metadata = ByteBuffer.allocate(25).order(ByteOrder.LITTLE_ENDIAN);
        assertFalse(VideoPreparationSettings.supportsPqMastering(metadata));
        metadata.putShort(17, (short) 1000).putShort(21, (short) 1000);
        assertTrue(VideoPreparationSettings.supportsPqMastering(metadata));
        metadata.putShort(21, (short) 4000);
        assertFalse(VideoPreparationSettings.supportsPqMastering(metadata));
        metadata.putShort(17, (short) 10000).putShort(21, (short) 1000);
        assertFalse(VideoPreparationSettings.supportsPqMastering(metadata));
        metadata.putShort(17, (short) 1000).put(0, (byte) 1);
        assertFalse(VideoPreparationSettings.supportsPqMastering(metadata));
    }
    @Test public void acceptsPlatformEightBitAvcProfilesWithoutAllowingHighBitDepthOrChroma() {
        for (int profile : new int[] {0, CodecProfileLevel.AVCProfileBaseline,
                CodecProfileLevel.AVCProfileMain, CodecProfileLevel.AVCProfileExtended,
                CodecProfileLevel.AVCProfileHigh, CodecProfileLevel.AVCProfileConstrainedBaseline,
                CodecProfileLevel.AVCProfileConstrainedHigh}) {
            assertTrue("Platform eight-bit profile must remain compatible: " + profile,
                VideoPreparationSettings.supportsAvcProfile(profile));
        }
        for (int profile : new int[] {-1, 3, CodecProfileLevel.AVCProfileHigh10,
                CodecProfileLevel.AVCProfileHigh422, CodecProfileLevel.AVCProfileHigh444}) {
            assertFalse("Unsupported profile must require preparation: " + profile,
                VideoPreparationSettings.supportsAvcProfile(profile));
        }
    }
    @Test public void boundsLandscapeAndPortraitWithoutCroppingOrUpscaling() {
        VideoPreparationSettings landscape = new VideoPreparationSettings(3840, 2160);
        VideoPreparationSettings portrait = new VideoPreparationSettings(2160, 3840);
        assertEquals(1920, landscape.width); assertEquals(1080, landscape.height);
        assertEquals(1080, portrait.width); assertEquals(1920, portrait.height);
        assertEquals(10_000_000, landscape.bitrate); assertEquals(landscape.bitrate, portrait.bitrate);
        VideoPreparationSettings fourThree = new VideoPreparationSettings(1920, 1440);
        assertEquals(1440, fourThree.width); assertEquals(1080, fourThree.height);
        VideoPreparationSettings small = new VideoPreparationSettings(640, 480);
        assertEquals(640, small.width); assertEquals(480, small.height);
    }
    @Test public void rejectsUnboundedOrEmptyDimensions() {
        for (int[] size : new int[][] {{0, 1080}, {-2, 720}, {4096, 2160}, {3000, 3000}}) {
            try { new VideoPreparationSettings(size[0], size[1]); fail("Invalid input must fail"); }
            catch (IllegalArgumentException expected) { /* Input must not enter the codec. */ }
        }
    }
}
