package de.eimir.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppShortcuts")
public final class AppShortcutsPlugin extends Plugin {
    @Override public void load() { receive(getActivity().getIntent()); }

    @Override protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        receive(intent);
    }

    private void receive(Intent intent) {
        if (intent == null || !"de.eimir.app.APP_SHORTCUT".equals(intent.getAction())) return;
        String action = intent.getStringExtra("shortcutAction");
        // Activity recreation must not replay an already accepted launch intent.
        intent.removeExtra("shortcutAction");
        if (AppShortcutDelivery.current.offer(action)) notifyListeners("shortcutOpen", new JSObject());
    }

    @PluginMethod public void peek(PluginCall call) {
        AppShortcutDelivery.Request request = AppShortcutDelivery.current.peek();
        JSObject result = new JSObject();
        if (request != null) result.put("request", new JSObject().put("id", request.id).put("action", request.action));
        call.resolve(result);
    }

    @PluginMethod public void acknowledge(PluginCall call) {
        AppShortcutDelivery.current.acknowledge(call.getString("id"));
        call.resolve();
    }
}
