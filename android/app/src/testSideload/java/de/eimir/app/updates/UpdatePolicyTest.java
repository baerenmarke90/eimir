package de.eimir.app.updates;

import static org.junit.Assert.*;
import java.security.MessageDigest;
import org.junit.Test;

public class UpdatePolicyTest {
    private static final String TAG = "android-test-v0.2.0-test.1";
    private static final String SHA = "a".repeat(64);

    @Test public void acceptsOnlyThePublicReleaseSources() {
        assertTrue(UpdatePolicy.allowedTransportUrl("https://api.github.com/repos/baerenmarke90/eimir/releases?per_page=30"));
        assertTrue(UpdatePolicy.allowedTransportUrl("https://release-assets.githubusercontent.com/asset?signature=example"));
        for (String url : new String[]{"http://github.com/a", "https://github.com.evil.test/a",
            "https://github.com@evil.test/a", "https://secret@github.com/a", "file:///data/a",
            "https://127.0.0.1/a", "https://github.com:444/a", "https://github.com/a#fragment"}) {
            assertFalse(url, UpdatePolicy.allowedTransportUrl(url));
        }
    }

    @Test public void bindsTheMarkerAndApkToAnExactReleasePath() {
        assertEquals("https://github.com/baerenmarke90/eimir/releases/download/" + TAG + "/" + UpdatePolicy.MARKER,
            UpdatePolicy.releaseUrl(TAG, UpdatePolicy.MARKER));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.releaseUrl(TAG, "other.apk"));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.releaseUrl("android-test-v1.0.0/../bad", UpdatePolicy.MARKER));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.releaseUrl("v1.0.0", UpdatePolicy.MARKER));
    }

    private void validate(String packageName, String name, long code, long size, String hash, int sdk, String revision) {
        UpdatePolicy.validateMetadata(packageName, "de.sidebyside.app", name, TAG, code, size, hash, sdk, revision);
    }

    @Test public void validatesTheIdentityAndBoundsBeforeAnyDownload() {
        validate("de.sidebyside.app", "0.2.0-test.1", 2, 1024, SHA, 26, "b".repeat(40));
        assertThrows(IllegalArgumentException.class, () -> validate("foreign.app", "0.2.0-test.1", 2, 1024, SHA, 26, "b".repeat(40)));
        assertThrows(IllegalArgumentException.class, () -> validate("de.sidebyside.app", "0.2.0-test.2", 2, 1024, SHA, 26, "b".repeat(40)));
        for (long code : new long[]{0, -1, 2_100_000_001L}) assertThrows(IllegalArgumentException.class,
            () -> validate("de.sidebyside.app", "0.2.0-test.1", code, 1024, SHA, 26, "b".repeat(40)));
        for (long size : new long[]{0, -1, UpdatePolicy.MAX_APK_BYTES + 1}) assertThrows(IllegalArgumentException.class,
            () -> validate("de.sidebyside.app", "0.2.0-test.1", 2, size, SHA, 26, "b".repeat(40)));
        assertThrows(IllegalArgumentException.class, () -> validate("de.sidebyside.app", "0.2.0-test.1", 2, 1024, SHA.toUpperCase(), 26, "b".repeat(40)));
        assertThrows(IllegalArgumentException.class, () -> validate("de.sidebyside.app", "0.2.0-test.1", 2, 1024, SHA, 25, "b".repeat(40)));
        assertThrows(IllegalArgumentException.class, () -> validate("de.sidebyside.app", "0.2.0-test.1", 2, 1024, SHA, 26, "development"));
    }

    @Test public void requiresTheExactNonemptySignerSetRegardlessOfOrder() {
        byte[][] installed = {{1, 2}, {3, 4}};
        assertTrue(UpdatePolicy.sameSigners(installed, new byte[][]{{3, 4}, {1, 2}}));
        assertFalse(UpdatePolicy.sameSigners(installed, new byte[][]{{1, 2}}));
        assertFalse(UpdatePolicy.sameSigners(installed, new byte[][]{{1, 2}, {5, 6}}));
        assertFalse(UpdatePolicy.sameSigners(new byte[0][], new byte[0][]));
        assertFalse(UpdatePolicy.sameSigners(null, installed));
        assertFalse(UpdatePolicy.sameSigners(new byte[][]{{1}, {1}}, new byte[][]{{1}, {1}}));
    }

    @Test public void rejectsDifferentMalformedOrTruncatedDigests() throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(new byte[]{1, 2, 3});
        assertTrue(UpdatePolicy.validDigest(digest, UpdatePolicy.hex(digest)));
        assertFalse(UpdatePolicy.validDigest(digest, SHA));
        assertFalse(UpdatePolicy.validDigest(digest, "aa"));
        assertFalse(UpdatePolicy.validDigest(digest, "z".repeat(64)));
    }
}
