package de.eimir.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(UnifiedPushBridge.class);
        super.onCreate(savedInstanceState);
        LegacyNativeDataCleanup.run(this);
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
