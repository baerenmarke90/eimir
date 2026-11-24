package de.eimir.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import android.view.autofill.AutofillManager;
import com.getcapacitor.CapacitorWebView;

/**
 * The app's WebView. It keeps the keyboard open while the platform's autofill
 * suggestions (a password manager's dropdown) are shown, see {@link AutofillFocusGate}.
 */
public class EimirWebView extends CapacitorWebView {
    private final AutofillFocusGate focusGate = new AutofillFocusGate();
    private AutofillManager autofillManager;
    private AutofillManager.AutofillCallback autofillCallback;

    public EimirWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        autofillManager = getContext().getSystemService(AutofillManager.class);
        if (autofillManager == null) return;
        autofillCallback = new AutofillManager.AutofillCallback() {
            @Override
            public void onAutofillEvent(View view, int childId, int event) {
                if (event == EVENT_INPUT_SHOWN) {
                    focusGate.onSuggestions(true);
                } else if (event == EVENT_INPUT_HIDDEN || event == EVENT_INPUT_UNAVAILABLE) {
                    // The window may really have lost focus meanwhile: tell the page now.
                    if (focusGate.onSuggestions(false) && !hasWindowFocus()) {
                        forwardWindowFocus(false);
                    }
                }
            }
        };
        autofillManager.registerCallback(autofillCallback);
    }

    @Override
    protected void onDetachedFromWindow() {
        if (autofillManager != null && autofillCallback != null) {
            autofillManager.unregisterCallback(autofillCallback);
        }
        autofillCallback = null;
        autofillManager = null;
        focusGate.reset();
        super.onDetachedFromWindow();
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        if (focusGate.shouldForward(hasWindowFocus)) {
            super.onWindowFocusChanged(hasWindowFocus);
        }
    }

    private void forwardWindowFocus(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
    }
}
