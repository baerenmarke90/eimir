package de.eimir.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WishShareRulesTest {
    private static final String WISH = "https://app.eimir.de/plan/wishes/7aa71de7-2da2-438a-bce2-d315c48d05ae";

    @Test
    public void classifiesOnlyTextAndImagesAndNeverAudio() {
        assertEquals(WishShareRules.Kind.TEXT, WishShareRules.classify("text/plain"));
        assertEquals(WishShareRules.Kind.TEXT, WishShareRules.classify("Text/Plain; charset=utf-8"));
        assertEquals(WishShareRules.Kind.IMAGE, WishShareRules.classify("image/jpeg"));
        assertEquals(WishShareRules.Kind.IMAGE, WishShareRules.classify("image/*"));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify("audio/ogg"));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify("audio/*"));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify("text/html"));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify("image/"));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify("*/*"));
        assertEquals(WishShareRules.Kind.NONE, WishShareRules.classify(null));
    }

    @Test
    public void keepsShortTextAndDropsBlankText() {
        assertEquals("https://example.invalid/lamp", WishShareRules.boundedText("https://example.invalid/lamp"));
        assertNull(WishShareRules.boundedText(null));
        assertNull(WishShareRules.boundedText(""));
        assertNull(WishShareRules.boundedText("  \n\t "));
    }

    @Test
    public void truncatesLongTextToTheLimit() {
        String exact = "a".repeat(WishShareRules.MAX_TEXT_CHARS);
        assertEquals(exact, WishShareRules.boundedText(exact));
        assertEquals(WishShareRules.MAX_TEXT_CHARS, WishShareRules.boundedText(exact + "b").length());
        assertEquals(exact, WishShareRules.boundedText(exact + "b".repeat(5000)));
    }

    @Test
    public void truncationNeverSplitsASurrogatePair() {
        String emoji = new String(Character.toChars(0x1F381));
        String text = "a".repeat(WishShareRules.MAX_TEXT_CHARS - 1) + emoji + "tail";
        String bounded = WishShareRules.boundedText(text);
        assertEquals(WishShareRules.MAX_TEXT_CHARS - 1, bounded.length());
        assertFalse(Character.isHighSurrogate(bounded.charAt(bounded.length() - 1)));
    }

    @Test
    public void acceptsBoundedHttpsAddresses() {
        assertTrue(WishShareRules.isShareableUrl(WISH, false));
        assertTrue(WishShareRules.isShareableUrl("HTTPS://app.eimir.de:8443/plan/wishes/x?from=wa#top", false));
        assertTrue(WishShareRules.isShareableUrl("https://app.eimir.de/" + "a".repeat(2048 - 22), false));
    }

    @Test
    public void rejectsOtherSchemesCredentialsAndMalformedAddresses() {
        assertFalse(WishShareRules.isShareableUrl(null, false));
        assertFalse(WishShareRules.isShareableUrl("", false));
        assertFalse(WishShareRules.isShareableUrl("http://app.eimir.de/plan/wishes/x", false));
        assertFalse(WishShareRules.isShareableUrl("javascript:alert(1)", false));
        assertFalse(WishShareRules.isShareableUrl("file:///sdcard/secret", false));
        assertFalse(WishShareRules.isShareableUrl("content://de.eimir.app.fileprovider/x", false));
        assertFalse(WishShareRules.isShareableUrl("de.eimir.app://notifications", false));
        assertFalse(WishShareRules.isShareableUrl("https://user:secret@app.eimir.de/x", false));
        assertFalse(WishShareRules.isShareableUrl("https:///no-host", false));
        assertFalse(WishShareRules.isShareableUrl("app.eimir.de/plan/wishes/x", false));
        assertFalse(WishShareRules.isShareableUrl("https://app.eimir.de/has space", false));
        assertFalse(WishShareRules.isShareableUrl("https://app.eimir.de/" + "a".repeat(2048), false));
    }

    @Test
    public void cleartextIsOnlyAcceptedWhenTheCallerAllowsIt() {
        assertFalse(WishShareRules.isShareableUrl("http://10.0.2.2:8000/plan/wishes/x", false));
        assertTrue(WishShareRules.isShareableUrl("http://10.0.2.2:8000/plan/wishes/x", true));
        assertFalse(WishShareRules.isShareableUrl("ftp://app.eimir.de/x", true));
    }

    @Test
    public void chooserTitleIsTrimmedBoundedAndOptional() {
        assertNull(WishShareRules.chooserTitle(null));
        assertNull(WishShareRules.chooserTitle("   "));
        assertEquals("Share wish", WishShareRules.chooserTitle("  Share wish "));
        assertEquals(WishShareRules.MAX_CHOOSER_TITLE_CHARS,
            WishShareRules.chooserTitle("t".repeat(WishShareRules.MAX_CHOOSER_TITLE_CHARS + 30)).length());
    }

    @Test
    public void sharedContentExpiresAfterTenMinutes() {
        assertFalse(WishShareRules.isExpired(1_000, 1_000 + WishShareRules.EXPIRY_MILLIS));
        assertTrue(WishShareRules.isExpired(1_000, 1_001 + WishShareRules.EXPIRY_MILLIS));
        assertFalse(WishShareRules.isExpired(1_000, 1_000));
    }
}
