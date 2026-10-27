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
import androidx.activity.result.PickVisualMediaRequest;
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
    // Documented Intent protocol; avoid adopting the alpha photopicker artifact.
    static final String REQUEST_LOCATION_METADATA = "android.provider.extra.REQUEST_LOCATION_METADATA_ACCESS";
    static final String FALLBACK_REQUEST_LOCATION_METADATA =
        "androidx.activity.result.contract.extra.PICK_IMAGES_REQUEST_LOCATION_METADATA_ACCESS";
    private final ActivityResultLauncher<Intent> mediaPicker;
    private Selection pending;
    private boolean askedLocationPermission;
    private volatile boolean disposed;

    private static final class Selection {
        final WebView view;
        final ValueCallback<Uri[]> callback;
        final FileChooserParams params;
        final boolean pickerMetadata;

        Selection(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params, boolean pickerMetadata) {
            this.view = view;
            this.callback = callback;
            this.params = params;
            this.pickerMetadata = pickerMetadata;
        }
    }

    PhotoFileChooser(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
        locationPermission = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), granted -> {
                Selection selection = pending;
                if (selection == null || disposed) return;
                if (granted) openMediaPicker(selection);
                else ordinarySelection(selection);
            });
        mediaPicker = bridge.registerForActivityResult(
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
                        // The modern picker owns its metadata consent. Its grant must
                        // never be upgraded with ACCESS_MEDIA_LOCATION.
                        originals[i] = selection.pickerMetadata ? selected[i]
                            : originalUri(bridge.getContext(), selected[i]);
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
        Selection selection = new Selection(view, callback, params, supportsPickerMetadata());
        pending = selection;
        if (selection.pickerMetadata || hasLocationPermission(bridge.getContext())) {
            openMediaPicker(selection);
        } else if (!askedLocationPermission) {
            askedLocationPermission = true;
            locationPermission.launch(Manifest.permission.ACCESS_MEDIA_LOCATION);
        } else {
            // A declined optional permission must not make every picker ask again.
            ordinarySelection(selection);
        }
        return true;
    }

    private void openMediaPicker(Selection selection) {
        try {
            mediaPicker.launch(mediaIntent(bridge.getContext(), selection.params, selection.pickerMetadata));
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

    static boolean supportsPickerMetadata() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && android.os.ext.SdkExtensions.getExtensionVersion(Build.VERSION_CODES.TIRAMISU) >= 23;
    }

    static Intent mediaIntent(Context context, FileChooserParams params, boolean pickerMetadata) {
        if (pickerMetadata) {
            PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE).build();
            Intent intent = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE
                ? new ActivityResultContracts.PickMultipleVisualMedia().createIntent(context, request)
                : new ActivityResultContracts.PickVisualMedia().createIntent(context, request);
            return intent.putExtra(REQUEST_LOCATION_METADATA, true)
                .putExtra(FALLBACK_REQUEST_LOCATION_METADATA, true);
        }
        // Keep the original media picker on older devices. GET_CONTENT picker
        // grants support authorized originals; old ACTION_PICK_IMAGES grants do not.
        Intent intent = params.createIntent();
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
            params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, params.getAcceptTypes().clone());
        return intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
