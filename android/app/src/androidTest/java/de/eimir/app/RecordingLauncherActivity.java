package de.eimir.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.WebViewListener;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** A test-only Activity spy; the real connector still dispatches to Android. */
public final class RecordingLauncherActivity extends LauncherActivity {
    public static final String RECORD_DISPATCH = "de.eimir.app.test.RECORD_PUSH_DISPATCH";
    private final List<Intent> requests = new ArrayList<>();
    private final CountDownLatch blankDocumentLoaded = new CountDownLatch(1);

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView webView = getBridge().getWebView();
        webView.stopLoading();
        // This test-only blank page has no application scripts, but the native
        // photo test must exercise an actual JavaScript-enabled Chromium input.
        webView.getSettings().setJavaScriptEnabled(true);
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                if ("about:blank".equals(view.getUrl())) blankDocumentLoaded.countDown();
            }
        });
        webView.loadUrl("about:blank");
    }

    public boolean awaitBlankDocument(long timeout, TimeUnit unit) throws InterruptedException {
        return blankDocumentLoaded.await(timeout, unit);
    }

    @Override
    public void sendBroadcast(Intent intent) {
        record(intent);
        super.sendBroadcast(intent);
    }

    @Override
    public void sendBroadcast(Intent intent, String permission, Bundle options) {
        record(intent);
        super.sendBroadcast(intent, permission, options);
    }

    private synchronized void record(Intent intent) { requests.add(new Intent(intent)); }

    public synchronized List<Intent> registrations() {
        List<Intent> result = new ArrayList<>();
        for (Intent request : requests) {
            if ("org.unifiedpush.android.distributor.REGISTER".equals(request.getAction())) result.add(request);
        }
        return result;
    }

    public synchronized boolean hasRequests() { return !requests.isEmpty(); }

    public synchronized void clear() { requests.clear(); }
}
