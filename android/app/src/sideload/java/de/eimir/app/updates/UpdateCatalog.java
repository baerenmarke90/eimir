package de.eimir.app.updates;

import org.json.JSONArray;
import org.json.JSONObject;

/** A release is eligible only when its final publication marker binds its APK. */
final class UpdateCatalog {
    interface Reader {
        String readJson(String url, int limit) throws Exception;
        void ensureActive();
    }
    static final class Offer {
        final String versionName, sourceRevision, releaseNotes, url, sha256;
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

    static Offer discover(Reader transport, String expectedPackage, int sdk) throws Exception {
        JSONArray releases = new JSONArray(transport.readJson(UpdatePolicy.CATALOG_URL, 2 * 1024 * 1024));
        UpdatePolicy.require(releases.length() <= 30);
        Offer best = null;
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
            UpdatePolicy.require(apk != null && integer(marker, "size") > 0 && integer(marker, "size") <= 32_768);
            String markerUrl = UpdatePolicy.releaseUrl(tag, UpdatePolicy.MARKER);
            UpdatePolicy.require(markerUrl.equals(marker.getString("browser_download_url")));
            Offer offer = new Offer(new JSONObject(transport.readJson(markerUrl, 32_768)), tag, apk, expectedPackage);
            if (offer.minSdk > sdk) continue;
            if (best != null && best.versionCode == offer.versionCode) {
                UpdatePolicy.require(best.sha256.equals(offer.sha256) && best.url.equals(offer.url));
            }
            if (best == null || offer.versionCode > best.versionCode) best = offer;
        }
        return best;
    }
}
