package de.eimir.app.updates;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** A release is eligible only when its final publication marker binds its APK. */
final class UpdateCatalog {
    interface Reader {
        String readJson(String url, int limit) throws Exception;
        void ensureActive();
    }
    static final class Offer {
        final String versionName, sourceRevision, releaseNotes, url, downloadUrl, sha256;
        final int versionCode, minSdk;
        final long size;

        Offer(JSONObject manifest, String tag, JSONObject apk, String expectedPackage) throws Exception {
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
            UpdatePolicy.require(name.equals(apk.getString("name")));
            UpdatePolicy.require(url.equals(apk.getString("browser_download_url")));
            UpdatePolicy.require(size == integer(apk, "size"));
            downloadUrl = UpdatePolicy.assetUrl(integer(apk, "id"));
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
        final JSONObject marker, apk;
        Candidate(String tag, int code, JSONObject marker, JSONObject apk) {
            this.tag = tag;
            this.code = code;
            this.marker = marker;
            this.apk = apk;
        }
    }

    static Offer discover(Reader transport, String expectedPackage, int sdk) throws Exception {
        JSONArray releases = new JSONArray(transport.readJson(UpdatePolicy.CATALOG_URL, 2 * 1024 * 1024));
        UpdatePolicy.require(releases.length() <= 30);
        List<Candidate> candidates = new ArrayList<>();
        Set<Integer> codes = new HashSet<>();
        for (int index = 0; index < releases.length(); index++) {
            transport.ensureActive();
            JSONObject release = releases.getJSONObject(index);
            String tag = release.getString("tag_name");
            if (release.optBoolean("draft", true) || !tag.startsWith("android-test-v")) continue;
            JSONArray assets = release.getJSONArray("assets");
            JSONObject marker = null, apk = null;
            for (int item = 0; item < assets.length(); item++) {
                JSONObject asset = assets.getJSONObject(item);
                String name = asset.getString("name");
                if (UpdatePolicy.MARKER.equals(name)) {
                    UpdatePolicy.require(marker == null);
                    marker = asset;
                }
                if (name.equals("eimir-" + tag + ".apk")) {
                    UpdatePolicy.require(apk == null);
                    apk = asset;
                }
            }
            if (marker == null) continue;
            int code = UpdatePolicy.testVersionCode(tag);
            // This immutable package migration is also enforced by the publisher.
            if ("de.eimir.app".equals(expectedPackage) && code <= 38) continue;
            UpdatePolicy.require(codes.add(code));
            candidates.add(new Candidate(tag, code, marker, apk));
        }
        candidates.sort((left, right) -> Integer.compare(right.code, left.code));
        for (Candidate candidate : candidates) {
            transport.ensureActive();
            String tag = candidate.tag;
            JSONObject marker = candidate.marker, apk = candidate.apk;
            UpdatePolicy.require(apk != null && integer(marker, "size") > 0 && integer(marker, "size") <= 32_768);
            String markerUrl = UpdatePolicy.releaseUrl(tag, UpdatePolicy.MARKER);
            UpdatePolicy.require(markerUrl.equals(marker.getString("browser_download_url")));
            JSONObject manifest = new JSONObject(transport.readJson(
                UpdatePolicy.assetUrl(integer(marker, "id")), 32_768));
            Offer offer = new Offer(manifest, tag, apk, expectedPackage);
            if (offer.minSdk > sdk) continue;
            return offer;
        }
        return null;
    }
}
