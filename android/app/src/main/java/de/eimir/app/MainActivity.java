package de.eimir.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;
    private PhotoFileChooser photoFileChooser;

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
        registerPlugin(UnifiedPushBridge.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(NativeSessionStoragePlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            photoFileChooser = new PhotoFileChooser(getBridge());
            getBridge().getWebView().setWebChromeClient(photoFileChooser);
        }
        LegacyNativeDataCleanup.run(this);
    }

    @Override
    public void onDestroy() {
        if (photoFileChooser != null) photoFileChooser.dispose();
        super.onDestroy();
    }

    @Override
    public void onResume() {
        super.onResume();
        foreground = true;
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }

    static boolean isForeground() {
        return foreground;
    }
}
