package de.eimir.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * Volatile handoff of one shared link/text and/or one shared photo, plus the outgoing
 * system share of a Wish link. Nothing is persisted here: the Web draft owns review and
 * any explicit Save, and a link and its photo may arrive as two separate shares.
 */
@CapacitorPlugin(name = "WishShare")
public class WishSharePlugin extends Plugin {
    /** Photos tried per share; the first adoptable one wins and the rest are ignored. */
    private static final int MAX_IMAGE_CANDIDATES = 10;

    private SelectedMediaProvider.Owner owner = new SelectedMediaProvider.Owner();
    private boolean active;
    private boolean ready;
    private boolean failed;
    private String pendingText;
    private Uri pendingImage;
    private int imageCount;
    private long receivedAt;
    private long generation;

    @Override public void load() { accept(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) { accept(intent); }

    private synchronized void clear() {
        owner.close(); owner = new SelectedMediaProvider.Owner();
        active = false; ready = false; failed = false;
        pendingText = null; pendingImage = null; imageCount = 0; generation++;
    }

    private synchronized void expireIfStale() {
        if (active && WishShareRules.isExpired(receivedAt, SystemClock.elapsedRealtime())) clear();
    }

    private void accept(Intent intent) {
        if (intent == null) return;
        final String action = intent.getAction();
        final boolean multiple = Intent.ACTION_SEND_MULTIPLE.equals(action);
        if (!multiple && !Intent.ACTION_SEND.equals(action)) return;
        // Audio and every other type stay with the voice flow or are ignored.
        final WishShareRules.Kind kind = WishShareRules.classify(intent.getType());
        if (kind == WishShareRules.Kind.NONE || multiple && kind != WishShareRules.Kind.IMAGE) return;

        final String authority = getContext().getPackageName() + ".selectedmedia";
        String text = null;
        int count = 0;
        final List<Uri> candidates = new ArrayList<>();
        try {
            if (multiple) {
                ArrayList<CharSequence> texts = intent.getCharSequenceArrayListExtra(Intent.EXTRA_TEXT);
                if (texts != null) for (CharSequence each : texts) {
                    text = WishShareRules.boundedText(each);
                    if (text != null) break;
                }
            } else {
                text = WishShareRules.boundedText(intent.getCharSequenceExtra(Intent.EXTRA_TEXT));
            }
            if (kind == WishShareRules.Kind.IMAGE) {
                final List<Uri> streams = new ArrayList<>();
                if (multiple) {
                    ArrayList<Uri> shared = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                    if (shared != null) streams.addAll(shared);
                } else {
                    Uri shared = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (shared != null) streams.add(shared);
                }
                for (Uri stream : streams) {
                    if (stream == null) continue;
                    count++;
                    if (candidates.size() < MAX_IMAGE_CANDIDATES && "content".equals(stream.getScheme())
                            && !authority.equals(stream.getAuthority())) candidates.add(stream);
                }
            }
        } catch (RuntimeException invalid) { return; }
        // A text share needs text; a photo share needs a photo or at least a caption.
        if (kind == WishShareRules.Kind.TEXT && text == null) return;
        if (kind == WishShareRules.Kind.IMAGE && text == null && candidates.isEmpty()) return;

        final long ticket;
        final SelectedMediaProvider.Owner selection;
        synchronized (this) {
            clear(); ticket = generation; selection = owner;
            active = true; receivedAt = SystemClock.elapsedRealtime();
            pendingText = text; imageCount = count; ready = candidates.isEmpty();
        }
        if (candidates.isEmpty()) {
            notifyListeners("wishShared", new JSObject(), true);
        } else {
            // Provider IPC never runs on the UI thread. Never persist the URI grant.
            bridge.execute(() -> {
                Uri adopted = null;
                for (Uri candidate : candidates) {
                    Uri leased = selection.adoptImage(getContext(), candidate);
                    if (authority.equals(leased.getAuthority())) { adopted = leased; break; }
                }
                synchronized (this) {
                    if (ticket != generation) { selection.close(); return; }
                    // A failed photo keeps the text, so a shared link stays usable.
                    if (adopted != null) pendingImage = adopted; else failed = true;
                    ready = true;
                }
                notifyListeners("wishShared", new JSObject(), true);
            });
        }
        // Prevent Activity recreation from replaying the consumed external share.
        intent.removeExtra(Intent.EXTRA_STREAM); intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_SUBJECT); intent.removeExtra(Intent.EXTRA_TITLE);
        intent.setClipData(null);
    }

    @PluginMethod public synchronized void peek(PluginCall call) {
        expireIfStale();
        JSObject result = new JSObject();
        result.put("available", ready && (pendingText != null || pendingImage != null));
        result.put("failed", ready && failed);
        result.put("generation", Long.toString(generation));
        result.put("text", ready && pendingText != null ? pendingText : JSONObject.NULL);
        result.put("hasImage", ready && pendingImage != null);
        result.put("imageCount", ready ? imageCount : 0);
        call.resolve(result);
    }

    @PluginMethod public synchronized void read(PluginCall call) {
        expireIfStale();
        if (!ready || pendingImage == null || !Long.toString(generation).equals(call.getString("generation"))) {
            call.reject("Shared photo expired", "WISH_SHARE_UNAVAILABLE"); return;
        }
        JSObject result = new JSObject(); result.put("uri", pendingImage.toString());
        result.put("mimeType", getContext().getContentResolver().getType(pendingImage)); call.resolve(result);
    }

    @PluginMethod public synchronized void discard(PluginCall call) {
        if (call.getString("generation") == null || Long.toString(generation).equals(call.getString("generation"))) clear();
        call.resolve();
    }

    /** Opens the Android system chooser with the Wish link, so the person can pick WhatsApp. */
    @PluginMethod public void share(PluginCall call) {
        final String url = call.getString("url");
        final boolean debuggable = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!WishShareRules.isShareableUrl(url, debuggable)) {
            call.reject("Invalid share address", "INVALID_SHARE_URL"); return;
        }
        final Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url);
        final Intent chooser = Intent.createChooser(send, WishShareRules.chooserTitle(call.getString("title")));
        // This app also accepts shared text, so it must not offer itself as the target.
        chooser.putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS,
            new ComponentName[] {new ComponentName(getContext(), LauncherActivity.class)});
        getActivity().runOnUiThread(() -> {
            try {
                // Do not preflight resolveActivity: package visibility can hide handlers.
                getActivity().startActivity(chooser);
                JSObject result = new JSObject(); result.put("shared", true); call.resolve(result);
            } catch (ActivityNotFoundException unavailable) {
                call.reject("No app can share the link", "NO_SHARE_TARGET");
            } catch (RuntimeException unavailable) {
                call.reject("Share sheet could not be opened", "SHARE_UNAVAILABLE");
            }
        });
    }

    @Override protected void handleOnDestroy() { clear(); }
}
