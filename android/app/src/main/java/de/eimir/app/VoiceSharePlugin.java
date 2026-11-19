package de.eimir.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Volatile one-file handoff. Web review and explicit Save own any upload. */
@CapacitorPlugin(name = "VoiceShare")
public class VoiceSharePlugin extends Plugin {
    private SelectedMediaProvider.Owner owner = new SelectedMediaProvider.Owner();
    private Uri pending;
    private String error;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final VoiceShareDeadline lease = new VoiceShareDeadline(
        this, SystemClock::elapsedRealtime, new VoiceShareDeadline.Timer() {
            public void post(Runnable task, long delay) { handler.postDelayed(task, delay); }
            public void cancel(Runnable task) { handler.removeCallbacks(task); }
        }, this::releaseSelection);

    @Override public void load() { accept(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) { accept(intent); }

    private void releaseSelection() {
        owner.close(); owner = new SelectedMediaProvider.Owner();
        pending = null; error = null;
    }

    private void accept(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        final Uri selected;
        try {
            selected = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (selected == null || !"content".equals(selected.getScheme())
                    || intent.getClipData() != null && intent.getClipData().getItemCount() != 1) return;
        } catch (RuntimeException invalid) { return; }
        final long ticket;
        final SelectedMediaProvider.Owner selection;
        synchronized (this) { ticket = lease.start(); selection = owner; }
        // Provider IPC never runs on the UI thread. Never persist the URI grant.
        bridge.execute(() -> {
            final Uri adopted = selection.adoptAudio(getContext(), selected);
            synchronized (this) {
                if (!lease.current(ticket)) { selection.close(); return; }
                if ((getContext().getPackageName() + ".selectedmedia").equals(adopted.getAuthority())) pending = adopted;
                else error = "AUDIO_SHARE_UNAVAILABLE";
            }
            notifyListeners("voiceShared", new JSObject(), true);
        });
        // Prevent Activity recreation from replaying the consumed external share.
        intent.removeExtra(Intent.EXTRA_STREAM); intent.setClipData(null);
    }

    @PluginMethod public synchronized void peek(PluginCall call) {
        long current = lease.generation();
        JSObject result = new JSObject();
        result.put("available", pending != null); result.put("failed", error != null);
        result.put("generation", Long.toString(current)); call.resolve(result);
    }

    @PluginMethod public synchronized void read(PluginCall call) {
        long current = lease.generation();
        if (pending == null || !Long.toString(current).equals(call.getString("generation"))) {
            call.reject("Voice selection expired", "AUDIO_SHARE_UNAVAILABLE"); return;
        }
        JSObject result = new JSObject(); result.put("uri", pending.toString());
        result.put("mimeType", getContext().getContentResolver().getType(pending)); call.resolve(result);
    }

    @PluginMethod public synchronized void discard(PluginCall call) {
        if (call.getString("generation") == null || Long.toString(lease.generation()).equals(call.getString("generation"))) lease.clear();
        call.resolve();
    }

    @Override protected synchronized void handleOnResume() {
        // Handler delays use uptime. Release an elapsed lease as soon as the device resumes.
        lease.expireIfDue();
    }

    @Override protected synchronized void handleOnDestroy() { lease.clear(); }
}
