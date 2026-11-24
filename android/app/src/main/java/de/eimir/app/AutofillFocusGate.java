package de.eimir.app;

/**
 * Decides which window-focus changes reach the WebView while the platform's
 * autofill suggestions are open.
 *
 * <p>The autofill dropdown is a focusable child window. When it opens, the
 * Activity window loses window focus and the WebView reacts by hiding the
 * keyboard, even though the text field is still the one being edited. The
 * dropdown also keeps the keyboard's input target on the Activity, so the
 * loss is not a real change of the editing target. The page therefore resized
 * and scrolled twice for one tap, and the keyboard did not come back.
 */
final class AutofillFocusGate {
    private boolean suggestionsShown;
    private boolean lossHeld;

    /**
     * Records that the autofill suggestions opened or closed.
     *
     * @return true when a window-focus loss was held back while they were open
     *     and has to be replayed if the window still has no focus
     */
    boolean onSuggestions(boolean shown) {
        suggestionsShown = shown;
        if (shown) return false;
        boolean replay = lossHeld;
        lossHeld = false;
        return replay;
    }

    /** True when the WebView should be told about this window-focus change. */
    boolean shouldForward(boolean hasWindowFocus) {
        if (hasWindowFocus) {
            lossHeld = false;
            return true;
        }
        if (suggestionsShown) {
            lossHeld = true;
            return false;
        }
        return true;
    }

    void reset() {
        suggestionsShown = false;
        lossHeld = false;
    }
}
