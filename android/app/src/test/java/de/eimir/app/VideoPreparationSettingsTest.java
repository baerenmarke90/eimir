package de.eimir.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class VideoPreparationSettingsTest {
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
