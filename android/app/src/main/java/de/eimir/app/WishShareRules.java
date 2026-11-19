package de.eimir.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Pure admission rules for incoming and outgoing Wish shares, kept free of Android types. */
final class WishShareRules {
    static final int MAX_TEXT_CHARS = 20_000;
    static final int MAX_URL_CHARS = 2048;
    static final int MAX_CHOOSER_TITLE_CHARS = 120;
    /** Shared content older than this is dropped, exactly like a shared voice note. */
    static final long EXPIRY_MILLIS = 10 * 60 * 1000L;

    private WishShareRules() {}

    /** Incoming content kinds this plugin handles. Audio always belongs to the voice flow. */
    enum Kind { TEXT, IMAGE, NONE }

    /** Classify a MIME type; anything other than text/plain and image/* (including audio) is NONE. */
    static Kind classify(String mimeType) {
        if (mimeType == null) return Kind.NONE;
        String type = mimeType.trim().toLowerCase(Locale.ROOT);
        int parameters = type.indexOf(';');
        if (parameters >= 0) type = type.substring(0, parameters).trim();
        if (type.equals("text/plain")) return Kind.TEXT;
        if (type.startsWith("image/") && type.length() > "image/".length()) return Kind.IMAGE;
        return Kind.NONE;
    }

    /**
     * Shared text, bounded to {@link #MAX_TEXT_CHARS} without splitting a surrogate pair.
     * Returns null when nothing but whitespace was shared.
     */
    static String boundedText(CharSequence shared) {
        if (shared == null) return null;
        String text = shared.toString();
        if (text.trim().isEmpty()) return null;
        if (text.length() <= MAX_TEXT_CHARS) return text;
        int end = MAX_TEXT_CHARS;
        if (Character.isHighSurrogate(text.charAt(end - 1))) end--;
        return text.substring(0, end);
    }

    /**
     * An address that may be handed to the system chooser: https only (http only when the
     * caller allows cleartext, i.e. debuggable builds), a host, no credentials, bounded length.
     */
    static boolean isShareableUrl(String url, boolean allowCleartext) {
        if (url == null || url.isEmpty() || url.length() > MAX_URL_CHARS) return false;
        final URI parsed;
        try { parsed = new URI(url); }
        catch (URISyntaxException invalid) { return false; }
        String scheme = parsed.getScheme();
        if (scheme == null) return false;
        scheme = scheme.toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !(allowCleartext && scheme.equals("http"))) return false;
        return parsed.getHost() != null && !parsed.getHost().isEmpty() && parsed.getUserInfo() == null;
    }

    /** Optional chooser heading: trimmed, bounded, or null when blank. */
    static String chooserTitle(String title) {
        if (title == null) return null;
        String trimmed = title.trim();
        if (trimmed.isEmpty()) return null;
        if (trimmed.length() <= MAX_CHOOSER_TITLE_CHARS) return trimmed;
        int end = MAX_CHOOSER_TITLE_CHARS;
        if (Character.isHighSurrogate(trimmed.charAt(end - 1))) end--;
        return trimmed.substring(0, end);
    }

    /** True once the pending share has outlived its volatile window. */
    static boolean isExpired(long receivedAtMillis, long nowMillis) {
        return nowMillis - receivedAtMillis > EXPIRY_MILLIS;
    }
}
