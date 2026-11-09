package de.eimir.app.updates;

import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class UpdateCatalogTest {
    private static final String PACKAGE = "de.eimir.app";
    private static final String NAME = "0.2.0-test.56";
    private static final String TAG = "android-test-v" + NAME;

    private long assetId(String tag, String name) {
        return Integer.toUnsignedLong((tag + "/" + name).hashCode()) + 1;
    }

    private String markerUrl(String name) {
        return UpdatePolicy.assetUrl(assetId("android-test-v" + name, UpdatePolicy.MARKER));
    }

    private JSONObject asset(String tag, String name, long size) throws Exception {
        return new JSONObject().put("id", assetId(tag, name)).put("name", name).put("size", size)
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

    @Test public void discoversAnExplicitPrereleaseUsingTheExactPublicAssetIds() throws Exception {
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        UpdateCatalog.Offer offer = UpdateCatalog.discover(reader, PACKAGE, 36);
        assertEquals(NAME, offer.versionName);
        assertEquals(1024, offer.size);
        assertEquals(UpdatePolicy.releaseUrl(TAG, "eimir-" + TAG + ".apk"), offer.url);
        assertEquals(UpdatePolicy.assetUrl(assetId(TAG, "eimir-" + TAG + ".apk")), offer.downloadUrl);
        assertEquals(2, reader.reads);
    }

    @Test public void choosesTheHighestCompatibleCodeRatherThanReleaseArrayOrder() throws Exception {
        String other = "0.2.0-test.57";
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)).put(release(other, true)));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        reader.responses.put(markerUrl(other), manifest(other, 57).toString());
        assertEquals(57, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
        reader.reads = 0;
        reader.responses.put(markerUrl(other), manifest(other, 57).put("minSdk", 37).toString());
        assertEquals(56, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(3, reader.reads);
    }

    @Test public void aFullCatalogWithUnavailableOldMarkersNeedsOnlyTwoRequests() throws Exception {
        JSONArray releases = new JSONArray();
        for (int code = 28; code <= 57; code++) releases.put(release("0.2.0-test." + code, true));
        Reader reader = new Reader(releases);
        reader.responses.put(markerUrl("0.2.0-test.57"), manifest("0.2.0-test.57", 57).toString());
        assertEquals(57, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
    }

    @Test public void rejectsMarkerMetadataAndManifestDisagreement() throws Exception {
        JSONObject release = release(NAME, true);
        release.getJSONArray("assets").getJSONObject(0)
            .put("browser_download_url", "https://evil.test/update.apk");
        Reader reader = new Reader(new JSONArray().put(release));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
    }

    @Test public void rejectsWrongPackageAndNonintegerOrMisorderedCodes() throws Exception {
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).put("packageName", "another.app").toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        for (Object code : new Object[]{"56", 56.5, -1, 57, 2_100_000_001L}) {
            reader.responses.put(markerUrl(NAME), manifest(NAME, 56).put("versionCode", code).toString());
            assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        }
    }

    @Test public void doesNotFetchHistoricalMarkersFromTheRetiredPackage() throws Exception {
        String legacy = "0.2.0-test.38", current = "0.2.0-test.39";
        Reader reader = new Reader(new JSONArray().put(release(legacy, true)).put(release(current, true)));
        reader.responses.put(markerUrl(current), manifest(current, 39).toString());
        assertEquals(39, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
        Reader historicalOnly = new Reader(new JSONArray().put(release(legacy, true)));
        assertNull(UpdateCatalog.discover(historicalOnly, PACKAGE, 36));
        assertEquals(1, historicalOnly.reads);
        reader.responses.put(markerUrl(current), manifest(current, 39).put("packageName", "de.sidebyside.app").toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
    }

    @Test public void rejectsAmbiguousCodesAcrossDifferentReleaseTags() throws Exception {
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)).put(release("0.3.0-test.56", true)));
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(1, reader.reads);
    }

    @Test public void invalidSelectedMetadataCannotFallBackToAnOlderOffer() throws Exception {
        String latest = "0.2.0-test.57";
        Reader reader = new Reader(new JSONArray().put(release(NAME, true)).put(release(latest, true)));
        reader.responses.put(markerUrl(latest), manifest(latest, 57)
            .put("asset", new JSONObject().put("name", "untrusted.apk")).toString());
        assertThrows(Exception.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(2, reader.reads);
    }

    @Test public void rejectsInvalidMarkerAndApkAssetIds() throws Exception {
        for (int index = 0; index <= 1; index++) {
            for (Object id : new Object[]{0, -1, "123", 1.5}) {
                JSONObject release = release(NAME, true);
                release.getJSONArray("assets").getJSONObject(index).put("id", id);
                Reader reader = new Reader(new JSONArray().put(release));
                reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
                assertThrows(Exception.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
            }
        }
    }
}
