package de.eimir.app.updates;

import org.json.JSONObject;
import java.io.FileNotFoundException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A release is eligible only when its final publication marker binds its APK. Discovery uses
 * the public release feed and plain release downloads, never the rate-limited GitHub API.
 */
final class UpdateCatalog {
    interface Reader {
        String readJson(String url, int limit) throws Exception;
        void ensureActive();
    }
    static final class Offer {
        final String versionName, sourceRevision, releaseNotes, url, downloadUrl, sha256;
        final int versionCode, minSdk;
        final long size;

        Offer(JSONObject manifest, String tag, String expectedPackage) throws Exception {
            UpdatePolicy.require(integer(manifest, "schemaVersion") == 1);
            UpdatePolicy.require("android-test".equals(manifest.getString("channel")));
            versionName = manifest.getString("versionName");
            long code = integer(manifest, "versionCode");
            long sdk = integer(manifest, "minSdk");
            UpdatePolicy.require(sdk >= 26 && sdk <= 100);
            minSdk = (int) sdk;
            sourceRevision = manifest.getString("sourceRevision");
            releaseNotes = manifest.getString("releaseNotes");
            UpdatePolicy.require(releaseNotes.length() <= 12_000);
            JSONObject asset = manifest.getJSONObject("asset");
            size = integer(asset, "size");
            sha256 = asset.getString("sha256");
            String name = asset.getString("name");
            UpdatePolicy.require(name.equals("eimir-" + tag + ".apk"));
            url = UpdatePolicy.releaseUrl(tag, name);
            UpdatePolicy.require(url.equals(asset.getString("url")));
            // The APK is served from the same immutable release as the marker; its size and
            // SHA-256 come from the marker and are verified while downloading.
            downloadUrl = url;
            UpdatePolicy.validateMetadata(manifest.getString("packageName"), expectedPackage,
                versionName, tag, code, size, sha256, minSdk, sourceRevision);
            versionCode = (int) code;
        }
    }

    static long integer(JSONObject object, String key) throws Exception {
        Object value = object.get(key);
        UpdatePolicy.require(value instanceof Integer || value instanceof Long);
        return ((Number) value).longValue();
    }

    private static final class Candidate {
        final String tag;
        final int code;
        Candidate(String tag, int code) {
            this.tag = tag;
            this.code = code;
        }
    }

    /** Only links to this repository's own test release tags are considered. */
    private static final Pattern FEED_TAG = Pattern.compile("href=\"https://github\\.com/"
        + Pattern.quote(UpdatePolicy.REPOSITORY)
        + "/releases/tag/(android-test-v[0-9]+\\.[0-9]+\\.[0-9]+-test\\.[1-9][0-9]*)\"");
    private static final int MAX_FEED_BYTES = 512 * 1024;
    private static final int MAX_MARKER_BYTES = 32_768;
    private static final int MAX_RELEASES = 30;

    static Offer discover(Reader transport, String expectedPackage, int sdk) throws Exception {
        String feed = transport.readJson(UpdatePolicy.FEED_URL, MAX_FEED_BYTES);
        List<Candidate> candidates = new ArrayList<>();
        Set<String> tags = new HashSet<>();
        Set<Integer> codes = new HashSet<>();
        Matcher links = FEED_TAG.matcher(feed);
        while (links.find()) {
            transport.ensureActive();
            String tag = links.group(1);
            if (!tags.add(tag)) continue;
            UpdatePolicy.require(tags.size() <= MAX_RELEASES);
            int code = UpdatePolicy.testVersionCode(tag);
            // This immutable package migration is also enforced by the publisher.
            if ("de.eimir.app".equals(expectedPackage) && code <= 38) continue;
            UpdatePolicy.require(codes.add(code));
            candidates.add(new Candidate(tag, code));
        }
        candidates.sort((left, right) -> Integer.compare(right.code, left.code));
        for (Candidate candidate : candidates) {
            transport.ensureActive();
            String marker;
            try {
                marker = transport.readJson(UpdatePolicy.releaseUrl(candidate.tag, UpdatePolicy.MARKER),
                    MAX_MARKER_BYTES);
            } catch (FileNotFoundException unfinished) {
                // A release without its final marker is not an installable publication.
                continue;
            }
            Offer offer = new Offer(new JSONObject(marker), candidate.tag, expectedPackage);
            if (offer.minSdk > sdk) continue;
            return offer;
        }
        return null;
    }
}
