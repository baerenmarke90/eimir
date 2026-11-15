package de.eimir.app;

import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports the device light/dark appearance to the Web shell. MainActivity
 * handles uiMode changes itself to keep the live WebView, so the WebView's
 * prefers-color-scheme keeps its launch value; this report keeps the Web
 * "System" theme live without reloading the app.
 */
@CapacitorPlugin(name = "SystemTheme")
public class SystemThemePlugin extends Plugin {
    private boolean reportedDark;

    @Override
    public void load() {
        reportedDark = isDark(getActivity().getResources().getConfiguration());
    }

    @PluginMethod
    public void current(PluginCall call) {
        reportedDark = isDark(getActivity().getResources().getConfiguration());
        call.resolve(appearance(reportedDark));
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        report(isDark(newConfig));
    }

    @Override
    protected void handleOnResume() {
        // A change while stopped is normally delivered as a configuration
        // change; re-checking on resume keeps the report robust either way.
        report(isDark(getActivity().getResources().getConfiguration()));
    }

    private void report(boolean dark) {
        if (dark == reportedDark) return;
        reportedDark = dark;
        notifyListeners("change", appearance(dark));
    }

    static boolean isDark(Configuration configuration) {
        return (configuration.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private static JSObject appearance(boolean dark) {
        JSObject result = new JSObject();
        result.put("dark", dark);
        return result;
    }
}
