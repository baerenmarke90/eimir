package de.eimir.app;

import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the Web layer protect private surfaces (#683, once messages) with
 * {@link WindowManager.LayoutParams#FLAG_SECURE}: no screenshots, no screen
 * recording and a blank Recents preview while the flag is set.
 *
 * The Web layer decides by route or surface and keeps the holder count; this
 * plugin only applies the requested window state on the UI thread and reports
 * the state the window actually has, so the caller can refuse to reveal
 * private content when protection is not confirmed (fail closed). The flag
 * belongs to the Activity window, so a recreated Activity starts unprotected
 * and the reloaded Web layer asks again before any private content renders.
 */
@CapacitorPlugin(name = "SecureScreen")
public class SecureScreenPlugin extends Plugin {
    @PluginMethod
    public void setSecure(PluginCall call) {
        Boolean secure = call.getBoolean("secure");
        if (secure == null) {
            call.reject("secure is required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            if (window == null) {
                call.reject("window unavailable");
                return;
            }
            WindowManager.LayoutParams attributes = window.getAttributes();
            int next = SecureWindowFlags.apply(attributes.flags, secure);
            if (next != attributes.flags) {
                if (secure) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            JSObject result = new JSObject();
            result.put("secure", SecureWindowFlags.isSecure(window.getAttributes().flags));
            call.resolve(result);
        });
    }
}
