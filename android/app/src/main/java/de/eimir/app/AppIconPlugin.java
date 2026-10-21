package de.eimir.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    @PluginMethod
    public void apply(PluginCall call) {
        String iconId = call.getString("iconId");
        try {
            LauncherIcons.apply(getContext(), iconId);
            call.resolve(new JSObject().put("iconId", iconId));
        } catch (IllegalArgumentException invalid) {
            call.reject("Unknown app icon", "UNKNOWN_APP_ICON");
        } catch (Exception unavailable) {
            call.reject("Launcher icon could not be applied", "APP_ICON_UNAVAILABLE");
        }
    }
}
