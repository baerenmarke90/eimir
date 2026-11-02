package de.eimir.app;

import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;
    private PhotoFileChooser photoFileChooser;
    private boolean recoveringRenderer;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
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
        registerPlugin(NativePushBridge.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(NativeSessionStoragePlugin.class);
        registerPlugin(PlanCalendarPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            getBridge().getWebView().setBackgroundColor(
                getResources().getColor(R.color.eimir_startup_background, getTheme()));
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    return recoverRenderer(view, detail);
                }
            });
            logRuntimeVersion();
            photoFileChooser = new PhotoFileChooser(getBridge());
            getBridge().getWebView().setWebChromeClient(photoFileChooser);
        }
    }

    private void logRuntimeVersion() {
        try {
            PackageInfo app = getPackageManager().getPackageInfo(getPackageName(), 0);
            PackageInfo renderer = WebView.getCurrentWebViewPackage();
            long code = android.os.Build.VERSION.SDK_INT >= 28 ? app.getLongVersionCode() : app.versionCode;
            Log.i("EimirRuntime", "app=" + app.versionName + " code=" + code
                + " sdk=" + android.os.Build.VERSION.SDK_INT
                + " webview=" + (renderer == null ? "unavailable" : renderer.versionName));
        } catch (Exception unavailable) {
            Log.i("EimirRuntime", "Runtime version unavailable");
        }
    }

    private boolean recoverRenderer(WebView view, RenderProcessGoneDetail detail) {
        if (recoveringRenderer) return true;
        recoveringRenderer = true;
        Log.w("EimirRuntime", "renderer_gone crashed=" + detail.didCrash()
            + " priority=" + detail.rendererPriorityAtExit());
        if (photoFileChooser != null) {
            try { photoFileChooser.dispose(); }
            catch (RuntimeException unavailable) { Log.w("EimirRuntime", "Picker callback unavailable after renderer exit"); }
            photoFileChooser = null;
        }
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.destroy();
        // Never reload a dead renderer or automatically replay an interrupted write.
        startActivity(new Intent(this, RuntimeRecoveryActivity.class));
        finish();
        return true;
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
