package de.eimir.app.updates;

import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class UpdateCatalogTest {
    private static final String PACKAGE = "de.sidebyside.app";
    private static final String NAME = "0.2.0-test.1";
    private static final String TAG = "android-test-v" + NAME;

    private JSONObject asset(String tag, String name, long size) throws Exception {
        return new JSONObject().put("name", name).put("size", size)
            .put("browser_download_url", UpdatePolicy.releaseUrl(tag, name));
    }

    private JSONObject manifest(String name, int code) throws Exception {
        String tag = "android-test-v" + name;
        return new JSONObject().put("schemaVersion", 1).put("channel", "android-test")
            .put("packageName", PACKAGE).put("versionName", name).put("versionCode", code)
            .put("minSdk", 26).put("sourceRevision", "a".repeat(40)).put("releaseNotes", "Test notes")
            .put("asset", new JSONObject().put("name", "eimir-" + tag + ".apk").put("size", 1024)
                .put("sha256", "b".repeat(64)).put("url", UpdatePolicy.releaseUrl(tag, "eimir-" + tag + ".apk")));
    }

    private JSONObject release(String name, boolean marker) throws Exception {
        String tag = "android-test-v" + name;
        JSONArray assets = new JSONArray().put(asset(tag, "eimir-" + tag + ".apk", 1024));
        if (marker) assets.put(asset(tag, UpdatePolicy.MARKER, 512));
        return new JSONObject().put("draft", false).put("prerelease", true)
            .put("tag_name", tag).put("assets", assets);
    }

    private static final class Reader implements UpdateCatalog.Reader {
        final Map<String, String> responses = new HashMap<>();
        int reads;
        Reader(JSONArray releases) { responses.put(UpdatePolicy.CATALOG_URL, releases.toString()); }
        public String readJson(String url, int limit) {
            reads++;
            if (!responses.containsKey(url)) throw new AssertionError("Unexpected public request: " + url);
            return responses.get(url);
        }
        public void ensureActive() {}
    }

    @Test public void doesNotOfferAnUnfinishedPublicationWithoutItsFinalMarker() throws Exception {
        Reader reader = new Reader(new JSONArray().put(release(NAME, false)));
        assertNull(UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(1, reader.reads);
    }

    @Test public void discoversAnExplicitPrereleaseWithoutRelyingOnStableLatest() throws Exception {
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)));
        reader.responses.put(UpdatePolicy.releaseUrl(TAG, UpdatePolicy.MARKER), manifest(NAME, 1).toString());
        UpdateCatalog.Offer offer = UpdateCatalog.discover(reader, PACKAGE, 36);
        assertEquals(NAME, offer.versionName);
        assertEquals(1024, offer.size);
        assertEquals(2, reader.reads);
    }

    @Test public void choosesTheHighestCompatibleCodeRatherThanReleaseArrayOrder() throws Exception {
        String other = "0.2.0-test.2";
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)).put(release(other, true)));
        reader.responses.put(UpdatePolicy.releaseUrl(TAG, UpdatePolicy.MARKER), manifest(NAME, 2).toString());
        String otherUrl = UpdatePolicy.releaseUrl("android-test-v" + other, UpdatePolicy.MARKER);
        reader.responses.put(otherUrl, manifest(other, 3).toString());
        assertEquals(3, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        reader.responses.put(otherUrl, manifest(other, 3).put("minSdk", 37).toString());
        assertEquals(2, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
    }

    @Test public void rejectsMarkerMetadataAndManifestDisagreement() throws Exception {
        JSONObject release = release(NAME, true);
        JSONObject badApk = release.getJSONArray("assets").getJSONObject(0);
        badApk.put("browser_download_url", "https://evil.test/update.apk");
        Reader reader = new Reader(new JSONArray().put(release));
        reader.responses.put(UpdatePolicy.releaseUrl(TAG, UpdatePolicy.MARKER), manifest(NAME, 1).toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
    }

    @Test public void rejectsWrongPackageAndNonintegerCodesBeforeDownloadingTheApk() throws Exception {
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)));
        String marker = UpdatePolicy.releaseUrl(TAG, UpdatePolicy.MARKER);
        reader.responses.put(marker, manifest(NAME, 1).put("packageName", "another.app").toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        for (Object code : new Object[]{"1", 1.5, -1, 2_100_000_001L}) {
            reader.responses.put(marker, manifest(NAME, 1).put("versionCode", code).toString());
            assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        }
    }

    @Test public void rejectsAmbiguousCodesAcrossDifferentReleaseTags() throws Exception {
        String other = "0.2.0-test.2";
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)).put(release(other, true)));
        reader.responses.put(UpdatePolicy.releaseUrl(TAG, UpdatePolicy.MARKER), manifest(NAME, 2).toString());
        reader.responses.put(UpdatePolicy.releaseUrl("android-test-v" + other, UpdatePolicy.MARKER), manifest(other, 2).toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
    }
}
