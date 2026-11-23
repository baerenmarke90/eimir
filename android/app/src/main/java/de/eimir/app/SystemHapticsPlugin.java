package de.eimir.app;

import android.os.Build;
import android.view.View;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plays Android system haptic feedback for the Web motion layer (Motion
 * Contract 4.10). {@link View#performHapticFeedback(int)} follows the device's
 * own touch-feedback setting and vibration tuning, unlike a custom waveform.
 */
@CapacitorPlugin(name = "SystemHaptics")
public class SystemHapticsPlugin extends Plugin {
    @PluginMethod
    public void perform(PluginCall call) {
        Integer feedback = SystemHapticFeedback.constantFor(
            call.getString("kind"),
            Build.VERSION.SDK_INT
        );
        if (feedback == null) {
            call.reject("Unknown haptic kind", "UNKNOWN_HAPTIC_KIND");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            View view = getBridge().getWebView();
            if (view == null) {
                call.reject("WebView unavailable", "HAPTICS_UNAVAILABLE");
                return;
            }
            JSObject result = new JSObject();
            result.put("played", view.performHapticFeedback(feedback));
            call.resolve(result);
        });
    }
}
