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
