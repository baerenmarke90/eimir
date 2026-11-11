package de.eimir.app;

import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static final String RECOVERY_ATTEMPTED = "eimir.rendererRecoveryAttempted";
    private static volatile boolean foreground;
    private PhotoFileChooser photoFileChooser;
    private boolean recoveringRenderer;
    private boolean resumed;
    private long resumeGeneration;
    private RendererRecovery rendererRecovery;
    private Intent pendingRendererIntent;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        rendererRecovery = new RendererRecovery(
            savedInstanceState != null && savedInstanceState.getBoolean(RECOVERY_ATTEMPTED));
        registerPlugin(NativePushBridge.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(NativeSessionStoragePlugin.class);
        registerPlugin(PlanCalendarPlugin.class);
        registerPlugin(PlanFilesPlugin.class);
        registerPlugin(VoiceSharePlugin.class);
        registerPlugin(BackgroundMediaUploadsPlugin.class);
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
        resumeGeneration++;
        Log.w("EimirRuntime", "renderer_gone crashed=" + detail.didCrash()
            + " priority=" + detail.rendererPriorityAtExit() + " resumed=" + resumed);
        rendererRecovery.lost(detail.didCrash(), photoFileChooser != null && photoFileChooser.hasPendingSelection());
        if (photoFileChooser != null) {
            try { photoFileChooser.dispose(); }
            catch (RuntimeException unavailable) { Log.w("EimirRuntime", "Picker callback unavailable after renderer exit"); }
            photoFileChooser = null;
        }
        // Capacitor's later lifecycle/detach callbacks must never reach a dead WebView.
        Bridge deadBridge = bridge;
        bridge = null;
        if (deadBridge != null) deadBridge.onDestroy();
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.destroy();
        scheduleRendererRecovery();
        return true;
    }

    private void scheduleRendererRecovery() {
        if (!resumed || !recoveringRenderer || isFinishing() || isDestroyed()) return;
        // Leave onRenderProcessGone before Activity recreation or native navigation.
        getWindow().getDecorView().post(() -> {
            if (!resumed || isFinishing() || isDestroyed()) return;
            RendererRecovery.Action action = rendererRecovery.take();
            if (action == RendererRecovery.Action.RECREATE) {
                // Retain only a new intent received after loss, never replay the old launch link.
                setIntent(pendingRendererIntent != null ? pendingRendererIntent
                    : new Intent(this, LauncherActivity.class).setAction(Intent.ACTION_MAIN));
                pendingRendererIntent = null;
                recreate();
            } else if (action == RendererRecovery.Action.PROMPT) {
                startActivity(new Intent(this, RuntimeRecoveryActivity.class));
                finish();
            }
        });
    }

    private void confirmForegroundRenderer() {
        if (bridge == null) return;
        WebView view = bridge.getWebView();
        long generation = ++resumeGeneration;
        // A gone callback may arrive during resume. Only a live renderer can end that return window.
        view.postVisualStateCallback(generation, new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long requestId) {
                if (resumed && generation == resumeGeneration && bridge != null
                        && bridge.getWebView() == view && !recoveringRenderer) {
                    rendererRecovery.rendered();
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        if (recoveringRenderer && intent != null) {
            pendingRendererIntent = new Intent(intent);
            // Also retain delivery between scheduling recreation and the actual relaunch.
            setIntent(pendingRendererIntent);
        }
        super.onNewIntent(intent);
    }

    @Override
    public void onSaveInstanceState(Bundle state) {
        state.putBoolean(RECOVERY_ATTEMPTED, rendererRecovery.attempted());
        super.onSaveInstanceState(state);
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
        resumed = true;
        if (recoveringRenderer) scheduleRendererRecovery();
        else confirmForegroundRenderer();
    }

    @Override
    public void onPause() {
        resumed = false;
        resumeGeneration++;
        foreground = false;
        super.onPause();
    }

    @Override
    public void onStop() {
        rendererRecovery.stopped();
        super.onStop();
    }

    static boolean isForeground() {
        return foreground;
    }
}
