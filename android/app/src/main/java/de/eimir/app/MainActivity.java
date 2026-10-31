package de.eimir.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;
    private PhotoFileChooser photoFileChooser;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(UnifiedPushBridge.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(NativeSessionStoragePlugin.class);
        registerPlugin(PlanCalendarPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            photoFileChooser = new PhotoFileChooser(getBridge());
            getBridge().getWebView().setWebChromeClient(photoFileChooser);
        }
        // Android Keystore load/delete and durable preference commits may stall a
        // fresh install or an upgrade. Keep migration out of Activity creation.
        // Bridge.execute uses the existing Capacitor background executor.
        if (getBridge() != null) {
            getBridge().execute(() ->
                LegacyNativeDataCleanup.run(getApplicationContext()));
        }
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
