package de.eimir.app.updates;

import static org.junit.Assert.*;
import java.io.FileNotFoundException;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;
import org.junit.Test;

public class UpdateCatalogTest {
    private static final String PACKAGE = "de.eimir.app";
    private static final String NAME = "0.2.0-test.56";
    private static final String TAG = "android-test-v" + NAME;

    private String markerUrl(String name) {
        return UpdatePolicy.releaseUrl("android-test-v" + name, UpdatePolicy.MARKER);
    }

    private JSONObject manifest(String name, int code) throws Exception {
        String tag = "android-test-v" + name;
        return new JSONObject().put("schemaVersion", 1).put("channel", "android-test")
            .put("packageName", PACKAGE).put("versionName", name).put("versionCode", code)
            .put("minSdk", 26).put("sourceRevision", "a".repeat(40)).put("releaseNotes", "Test notes")
            .put("asset", new JSONObject().put("name", "eimir-" + tag + ".apk").put("size", 1024)
                .put("sha256", "b".repeat(64)).put("url", UpdatePolicy.releaseUrl(tag, "eimir-" + tag + ".apk")));
    }

    /** One Atom entry the way GitHub renders a release link. */
    private static String entry(String repository, String tag) {
        return "<entry><id>tag:github.com,2008:Repository/1/" + tag + "</id>"
            + "<link rel=\"alternate\" type=\"text/html\" href=\"https://github.com/" + repository
            + "/releases/tag/" + tag + "\"/><title>" + tag + "</title></entry>";
    }

    private static String feed(String... names) {
        StringBuilder feed = new StringBuilder("<?xml version=\"1.0\"?><feed>");
        for (String name : names) feed.append(entry(UpdatePolicy.REPOSITORY, "android-test-v" + name));
        return feed.append("</feed>").toString();
    }

    /** Serves the feed and release downloads; an unknown release download is a missing asset. */
    private static final class Reader implements UpdateCatalog.Reader {
        final Map<String, String> responses = new HashMap<>();
        int reads;
        Reader(String feed) { responses.put(UpdatePolicy.FEED_URL, feed); }
        public String readJson(String url, int limit) throws Exception {
            reads++;
            if (url.equals(UpdatePolicy.FEED_URL) || responses.containsKey(url)) return responses.get(url);
            if (url.startsWith("https://github.com/" + UpdatePolicy.REPOSITORY + "/releases/download/")) {
                throw new FileNotFoundException("NETWORK");
            }
            throw new AssertionError("Unexpected public request: " + url);
        }
        public void ensureActive() {}
    }

    @Test public void usesOnlyThePublicFeedAndReleaseDownloadsNeverTheRateLimitedApi() throws Exception {
        assertFalse(UpdatePolicy.FEED_URL.contains("api.github.com"));
        assertTrue(UpdatePolicy.allowedTransportUrl(UpdatePolicy.FEED_URL));
        assertTrue(UpdatePolicy.allowedTransportUrl(markerUrl(NAME)));
        Reader reader = new Reader(feed(NAME));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        UpdateCatalog.discover(reader, PACKAGE, 36);
        assertFalse(UpdatePolicy.allowedTransportUrl("https://api.github.com/repos/baerenmarke90/eimir/releases"));
    }

    @Test public void doesNotOfferAnUnfinishedPublicationWithoutItsFinalMarker() throws Exception {
        Reader reader = new Reader(feed(NAME));
        assertNull(UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(2, reader.reads);
    }

    @Test public void discoversAnExplicitPrereleaseFromItsExactReleaseDownloads() throws Exception {
        Reader reader = new Reader(feed(NAME));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        UpdateCatalog.Offer offer = UpdateCatalog.discover(reader, PACKAGE, 36);
        assertEquals(NAME, offer.versionName);
        assertEquals(1024, offer.size);
        String apk = UpdatePolicy.releaseUrl(TAG, "eimir-" + TAG + ".apk");
        assertEquals(apk, offer.url);
        assertEquals(apk, offer.downloadUrl);
        assertEquals(2, reader.reads);
    }

    @Test public void choosesTheHighestCompatibleCodeRatherThanFeedOrder() throws Exception {
        String other = "0.2.0-test.57";
        Reader reader = new Reader(feed(NAME, other));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        reader.responses.put(markerUrl(other), manifest(other, 57).toString());
        assertEquals(57, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
        reader.reads = 0;
        reader.responses.put(markerUrl(other), manifest(other, 57).put("minSdk", 37).toString());
        assertEquals(56, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(3, reader.reads);
    }

    @Test public void aFullFeedWithUnavailableOldMarkersNeedsOnlyTwoRequests() throws Exception {
        String[] names = new String[10];
        for (int index = 0; index < names.length; index++) names[index] = "0.2.0-test." + (48 + index);
        Reader reader = new Reader(feed(names));
        reader.responses.put(markerUrl("0.2.0-test.57"), manifest("0.2.0-test.57", 57).toString());
        assertEquals(57, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
    }

    @Test public void skipsAReleaseWhoseMarkerIsMissingAndOffersTheNextOne() throws Exception {
        String older = "0.2.0-test.55";
        Reader reader = new Reader(feed(NAME, older));
        reader.responses.put(markerUrl(older), manifest(older, 55).toString());
        assertEquals(55, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(3, reader.reads);
    }

    @Test public void rejectsAMarkerThatPointsAtAnotherApkUrl() throws Exception {
        Reader reader = new Reader(feed(NAME));
        JSONObject manifest = manifest(NAME, 56);
        manifest.getJSONObject("asset").put("url", "https://evil.test/update.apk");
        reader.responses.put(markerUrl(NAME), manifest.toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
    }

    @Test public void rejectsWrongPackageAndNonintegerOrMisorderedCodes() throws Exception {
        Reader reader = new Reader(feed(NAME));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).put("packageName", "another.app").toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        for (Object code : new Object[]{"56", 56.5, -1, 57, 2_100_000_001L}) {
            reader.responses.put(markerUrl(NAME), manifest(NAME, 56).put("versionCode", code).toString());
            assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        }
    }

    @Test public void doesNotFetchHistoricalMarkersFromTheRetiredPackage() throws Exception {
        String legacy = "0.2.0-test.38", current = "0.2.0-test.39";
        Reader reader = new Reader(feed(legacy, current));
        reader.responses.put(markerUrl(current), manifest(current, 39).toString());
        assertEquals(39, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
        Reader historicalOnly = new Reader(feed(legacy));
        assertNull(UpdateCatalog.discover(historicalOnly, PACKAGE, 36));
        assertEquals(1, historicalOnly.reads);
        reader.responses.put(markerUrl(current), manifest(current, 39).put("packageName", "de.sidebyside.app").toString());
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
    }

    @Test public void rejectsAmbiguousCodesAcrossDifferentReleaseTags() throws Exception {
        Reader reader = new Reader(feed(NAME, "0.3.0-test.56"));
        assertThrows(IllegalArgumentException.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(1, reader.reads);
    }

    @Test public void invalidSelectedMetadataCannotFallBackToAnOlderOffer() throws Exception {
        String latest = "0.2.0-test.57";
        Reader reader = new Reader(feed(NAME, latest));
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        reader.responses.put(markerUrl(latest), manifest(latest, 57)
            .put("asset", new JSONObject().put("name", "untrusted.apk")).toString());
        assertThrows(Exception.class, () -> UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(2, reader.reads);
    }

    @Test public void ignoresFeedLinksThatAreNotThisRepositorysTestReleases() throws Exception {
        String feed = "<feed>"
            + entry("someone/else", "android-test-v0.2.0-test.99")
            + entry(UpdatePolicy.REPOSITORY, "v0.1.1")
            + entry(UpdatePolicy.REPOSITORY, "android-test-v0.2.0-test.0")
            + entry(UpdatePolicy.REPOSITORY, "android-test-v0.2.0-test.58/../x")
            + "<content type=\"html\">&lt;a href=&quot;https://github.com/" + UpdatePolicy.REPOSITORY
            + "/releases/tag/android-test-v0.2.0-test.98&quot;&gt;</content>"
            + entry(UpdatePolicy.REPOSITORY, TAG) + "</feed>";
        Reader reader = new Reader(feed);
        reader.responses.put(markerUrl(NAME), manifest(NAME, 56).toString());
        assertEquals(56, UpdateCatalog.discover(reader, PACKAGE, 36).versionCode);
        assertEquals(2, reader.reads);
    }

    @Test public void anEmptyFeedOffersNothing() throws Exception {
        Reader reader = new Reader("<feed></feed>");
        assertNull(UpdateCatalog.discover(reader, PACKAGE, 36));
        assertEquals(1, reader.reads);
    }
}
