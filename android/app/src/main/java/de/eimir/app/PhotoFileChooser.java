package de.eimir.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.Locale;

/** Preserve explicitly authorized photo bytes before the existing Web upload. */
final class PhotoFileChooser extends BridgeWebChromeClient {
    // The Web intake owns its smaller photo limit and its rejected-file feedback.
    private static final int MAX_RESULT_URIS = 1000;
    private final Bridge bridge;
    private final ActivityResultLauncher<String> locationPermission;
    private final ActivityResultLauncher<Intent> documents;
    private Selection pending;
    private boolean askedLocationPermission;
    private volatile boolean disposed;

    private static final class Selection {
        final WebView view;
        final ValueCallback<Uri[]> callback;
        final FileChooserParams params;

        Selection(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            this.view = view;
            this.callback = callback;
            this.params = params;
        }
    }

    PhotoFileChooser(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        locationPermission = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), granted -> {
                Selection selection = pending;
                if (selection == null || disposed) return;
                if (granted) openDocuments(selection);
                else ordinarySelection(selection);
            });
        documents = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                Selection selection = pending;
                if (selection == null || disposed) return;
                Uri[] selected = result.getResultCode() == Activity.RESULT_OK
                    ? selectedUris(result.getData(), selection.params.getMode()) : null;
                if (selected == null) {
                    complete(selection, null);
                    return;
                }
                // Provider IPC/open checks must not block the Activity/UI thread.
                bridge.execute(() -> {
                    Uri[] originals = new Uri[selected.length];
                    for (int i = 0; i < selected.length; i++) {
                        if (disposed) return;
                        originals[i] = originalUri(bridge.getContext(), selected[i]);
                    }
                    bridge.getActivity().runOnUiThread(() -> complete(selection, originals));
                });
            });
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
            FileChooserParams params) {
        if (disposed || pending != null) {
            callback.onReceiveValue(null);
            return true;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !isPhotoSelection(params)) {
            return super.onShowFileChooser(view, callback, params);
        }
        Selection selection = new Selection(view, callback, params);
        pending = selection;
        if (hasLocationPermission(bridge.getContext())) {
            openDocuments(selection);
        } else if (!askedLocationPermission) {
            askedLocationPermission = true;
            locationPermission.launch(Manifest.permission.ACCESS_MEDIA_LOCATION);
        } else {
            // A declined optional permission must not make every picker ask again.
            ordinarySelection(selection);
        }
        return true;
    }

    private void openDocuments(Selection selection) {
        try {
            documents.launch(documentIntent(selection.params));
        } catch (android.content.ActivityNotFoundException unavailable) {
            ordinarySelection(selection);
        }
    }

    private void ordinarySelection(Selection selection) {
        if (pending != selection || disposed) return;
        boolean handled = super.onShowFileChooser(selection.view,
            result -> complete(selection, result), selection.params);
        if (!handled) complete(selection, null);
    }

    private void complete(Selection selection, Uri[] result) {
        if (pending != selection || disposed) return;
        pending = null;
        selection.callback.onReceiveValue(result);
    }

    void dispose() {
        Selection selection = pending;
        pending = null;
        disposed = true;
        if (selection != null) selection.callback.onReceiveValue(null);
    }

    static boolean isPhotoSelection(FileChooserParams params) {
        if (params.isCaptureEnabled()
                || (params.getMode() != FileChooserParams.MODE_OPEN
                    && params.getMode() != FileChooserParams.MODE_OPEN_MULTIPLE)) return false;
        String[] types = params.getAcceptTypes();
        if (types.length == 0) return false;
        for (String type : types) {
            if (type == null || !type.toLowerCase(Locale.ROOT).startsWith("image/")) return false;
        }
        return true;
    }

    static Intent documentIntent(FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        return new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(types.length == 1 ? types[0] : "image/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, types.clone())
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }

    static Uri[] selectedUris(Intent data, int mode) {
        if (data == null) return null;
        LinkedHashSet<Uri> values = new LinkedHashSet<>();
        ClipData clips = data.getClipData();
        int count = clips == null ? 1 : clips.getItemCount();
        if (count > MAX_RESULT_URIS) return null;
        for (int i = 0; i < count; i++) {
            Uri uri = clips == null ? data.getData() : clips.getItemAt(i).getUri();
            if (uri == null || !"content".equals(uri.getScheme())
                    || uri.getAuthority() == null || uri.getAuthority().isEmpty()) return null;
            values.add(uri);
            if (mode != FileChooserParams.MODE_OPEN_MULTIPLE) break;
        }
        return values.isEmpty() ? null : values.toArray(new Uri[0]);
    }

    static boolean hasLocationPermission(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_MEDIA_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    static Uri originalUri(Context context, Uri selected) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || !hasLocationPermission(context)) return selected;
        try {
            Uri media = DocumentsContract.isDocumentUri(context, selected)
                ? MediaStore.getMediaUri(context, selected) : selected;
            if (media == null || !MediaStore.AUTHORITY.equals(media.getAuthority())) return selected;
            Uri original = MediaStore.setRequireOriginal(media);
            try (AssetFileDescriptor readable = context.getContentResolver()
                    .openAssetFileDescriptor(original, "r")) {
                if (readable != null) return original;
            }
        } catch (IOException | SecurityException | IllegalArgumentException
                | UnsupportedOperationException unavailable) {
            // Provider failures retain the selected readable photo, never parser/URI diagnostics.
        }
        return selected;
    }
}
