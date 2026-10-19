package de.eimir.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The constant-false branch disappears from normal release bytecode.
        // The implementation and install permission exist only in src/sideload.
        if (BuildConfig.EIMIR_SIDELOAD_UPDATES) {
            try {
                registerPlugin(Class.forName("de.eimir.app.updates.AppUpdatesPlugin")
                    .asSubclass(Plugin.class));
            } catch (ClassNotFoundException error) {
                throw new IllegalStateException("Sideload update adapter is missing", error);
            }
        }
        registerPlugin(NativeSessionStoragePlugin.class);
        super.onCreate(savedInstanceState);
        LegacyNativeDataCleanup.run(this);
    }
}
