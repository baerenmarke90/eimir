package de.eimir.app.updates;

import java.net.URI;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Pure release/installation policy; network and Android remain adapters. */
public final class UpdatePolicy {
    public static final String REPOSITORY = "baerenmarke90/eimir";
    public static final String CATALOG_URL =
        "https://api.github.com/repos/" + REPOSITORY + "/releases?per_page=30";
    public static final String MARKER = "eimir-test-update.json";
    public static final long MAX_APK_BYTES = 256L * 1024 * 1024;
    public static final int MAX_VERSION_CODE = 2_100_000_000;

    private UpdatePolicy() {}

    public static String releaseUrl(String tag, String asset) {
        require(tag.matches("android-test-v[0-9]+\\.[0-9]+\\.[0-9]+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?"));
        require(asset.equals(MARKER) || asset.equals("eimir-" + tag + ".apk"));
        return "https://github.com/" + REPOSITORY + "/releases/download/" + tag + "/" + asset;
    }

    public static boolean allowedTransportUrl(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && uri.getUserInfo() == null
                && uri.getFragment() == null && (uri.getPort() == -1 || uri.getPort() == 443)
                && Arrays.asList("api.github.com", "github.com", "release-assets.githubusercontent.com",
                    "objects.githubusercontent.com").contains(uri.getHost());
        } catch (Exception error) {
            return false;
        }
    }

    public static void validateMetadata(String packageName, String expectedPackage,
        String versionName, String tag, long versionCode, long size, String sha256,
        int minSdk, String sourceRevision) {
        require(packageName.equals(expectedPackage));
        require(tag.equals("android-test-v" + versionName));
        releaseUrl(tag, MARKER);
        require(versionCode > 0 && versionCode <= MAX_VERSION_CODE);
        require(size > 0 && size <= MAX_APK_BYTES);
        require(sha256.matches("[0-9a-f]{64}"));
        require(minSdk >= 26 && minSdk <= 100);
        require(sourceRevision.matches("[0-9a-f]{40}"));
    }

    public static boolean sameSigners(byte[][] installed, byte[][] candidate) {
        if (installed == null || candidate == null || installed.length == 0
            || installed.length != candidate.length) return false;
        Set<String> left = new HashSet<>();
        Set<String> right = new HashSet<>();
        for (byte[] signature : installed) left.add(hex(signature));
        for (byte[] signature : candidate) right.add(hex(signature));
        return left.equals(right) && left.size() == installed.length;
    }

    public static boolean validDigest(byte[] actual, String expected) {
        if (!expected.matches("[0-9a-f]{64}")) return false;
        byte[] decoded = new byte[32];
        for (int index = 0; index < decoded.length; index++) {
            decoded[index] = (byte) Integer.parseInt(expected.substring(index * 2, index * 2 + 2), 16);
        }
        return MessageDigest.isEqual(actual, decoded);
    }

    public static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    static void require(boolean condition) {
        if (!condition) throw new IllegalArgumentException("INVALID_RELEASE");
    }
}
