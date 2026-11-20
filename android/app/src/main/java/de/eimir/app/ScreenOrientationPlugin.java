package de.eimir.app;

import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets a full-screen Web view ask for landscape and give the orientation back
 * (#2048, the full-screen garden). Only these two states exist: landscape
 * follows the sensor between both landscape sides, and release returns to the
 * Activity's normal behaviour. While the app is in the background the lock is
 * lifted and it returns on resume only if the view still asks for it.
 */
@CapacitorPlugin(name = "ScreenOrientation")
public class ScreenOrientationPlugin extends Plugin {
    private boolean landscape;

    @PluginMethod
    public void lockLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            landscape = true;
            applyLandscape();
            call.resolve();
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            landscape = false;
            unlock();
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        unlock();
    }

    @Override
    protected void handleOnResume() {
        if (landscape) applyLandscape();
    }

    private void applyLandscape() {
        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void unlock() {
        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }
}
