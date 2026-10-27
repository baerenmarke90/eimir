package de.eimir.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.Manifest;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.TimeoutException;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Real Android grants/document handoff, separate from browser-upload fixtures. */
public class PhotoFileChooserTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final Context context = instrumentation.getTargetContext();
    private ActivityScenario<LauncherActivity> scenario;
    private LauncherActivity activity;
    private PhotoFileChooser chooser;
    private static Uri fixture;
    private static File source;

    private static FileChooserParams parameters(int mode, boolean capture, String... types) {
        return new FileChooserParams() {
            @Override public int getMode() { return mode; }
            @Override public String[] getAcceptTypes() { return types; }
            @Override public boolean isCaptureEnabled() { return capture; }
            @Override public CharSequence getTitle() { return null; }
            @Override public String getFilenameHint() { return null; }
            @Override public Intent createIntent() { return new Intent(Intent.ACTION_GET_CONTENT).setType("image/*"); }
        };
    }

    @After
    public void cleanup() {
        if (scenario != null) scenario.close();
    }

    @AfterClass
    public static void removeGalleryFixture() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (fixture != null) context.getContentResolver().delete(fixture, null, null);
        if (source != null) source.delete();
    }

    @BeforeClass
    public static void prepareGalleryFixtureBeforeAnyRecentPickerQuery() throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String name = "gps-" + UUID.randomUUID().toString().substring(0, 8) + ".jpg";
        source = new File(context.getCacheDir(), name);
        try (OutputStream output = new FileOutputStream(source)) {
            Bitmap.createBitmap(320, 240, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.JPEG, 95, output);
        }
        ExifInterface exif = new ExifInterface(source.getPath());
        exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, "N");
        exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE, "52/1,31/1,0/1");
        exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, "E");
        exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE, "13/1,24/1,0/1");
        exif.saveAttributes();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/eimir-native-fixtures");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        fixture = context.getContentResolver().insert(
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
        assertNotNull(fixture);
        try (InputStream input = new java.io.FileInputStream(source);
                OutputStream output = context.getContentResolver().openOutputStream(fixture)) {
            assertNotNull(output);
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        context.getContentResolver().update(fixture, values, null, null);
        String ownedPath;
        try (android.database.Cursor row = context.getContentResolver().query(fixture,
                new String[] {MediaStore.Images.Media.DATA}, null, null, null)) {
            assertNotNull(row);
            assertTrue(row.moveToFirst());
            ownedPath = row.getString(0);
        }
        assertNotNull(ownedPath);
        CountDownLatch indexed = new CountDownLatch(1);
        AtomicReference<Uri> scanned = new AtomicReference<>();
        android.media.MediaScannerConnection.scanFile(context, new String[] {ownedPath},
            new String[] {"image/jpeg"}, (path, uri) -> { scanned.set(uri); indexed.countDown(); });
        assertTrue("The owned gallery fixture finishes indexing", indexed.await(10, TimeUnit.SECONDS));
        assertNotNull(scanned.get());
        assertEquals(android.content.ContentUris.parseId(fixture),
            android.content.ContentUris.parseId(scanned.get()));
        // DocumentsProvider recents do not promise change notifications. The item
        // must exist before the cancellation tests first open/cache that task.
    }

    @Test
    public void onlyOrdinaryImageInputsUseTheOriginalDocumentPath() {
        assertTrue(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN_MULTIPLE,
            false, "image/jpeg", "image/heic", "image/webp")));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, true, "image/*")));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, false)));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, false, "")));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, false,
            "image/jpeg", "application/pdf")));
        Intent intent = PhotoFileChooser.documentIntent(parameters(FileChooserParams.MODE_OPEN_MULTIPLE,
            false, "image/jpeg", "image/heic"));
        assertEquals(Intent.ACTION_OPEN_DOCUMENT, intent.getAction());
        assertTrue(intent.hasCategory(Intent.CATEGORY_OPENABLE));
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
        assertArrayEquals(new String[] {"image/jpeg", "image/heic"},
            intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
        assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, intent.getFlags());
        assertFalse(PhotoFileChooser.documentIntent(parameters(FileChooserParams.MODE_OPEN, false,
            "image/jpeg")).getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true));
    }

    @Test
    public void returnedFilesKeepSelectionOrderAndRejectUntrustedSchemes() {
        Uri first = Uri.parse("content://fixture.photos/one");
        Uri second = Uri.parse("content://fixture.photos/two");
        ClipData clips = ClipData.newRawUri("selected", first);
        clips.addItem(new ClipData.Item(second));
        clips.addItem(new ClipData.Item(first));
        Intent result = new Intent();
        result.setClipData(clips);
        assertArrayEquals(new Uri[] {first, second},
            PhotoFileChooser.selectedUris(result, FileChooserParams.MODE_OPEN_MULTIPLE));
        assertArrayEquals(new Uri[] {first}, PhotoFileChooser.selectedUris(result, FileChooserParams.MODE_OPEN));
        assertNull(PhotoFileChooser.selectedUris(null, FileChooserParams.MODE_OPEN));
        assertNull(PhotoFileChooser.selectedUris(new Intent(), FileChooserParams.MODE_OPEN));
        assertNull(PhotoFileChooser.selectedUris(new Intent().setData(Uri.parse("file:///private.jpg")),
            FileChooserParams.MODE_OPEN));
        clips.addItem(new ClipData.Item(Uri.parse("https://example.invalid/photo.jpg")));
        assertNull(PhotoFileChooser.selectedUris(result, FileChooserParams.MODE_OPEN_MULTIPLE));
    }

    @Test
    public void deniedPhotoLocationPermissionNeverUpgradesASelectedUri() {
        Context denied = new ContextWrapper(context) {
            @Override public int checkPermission(String permission, int pid, int uid) {
                return Manifest.permission.ACCESS_MEDIA_LOCATION.equals(permission)
                    ? PackageManager.PERMISSION_DENIED : super.checkPermission(permission, pid, uid);
            }
        };
        Uri selected = Uri.parse("content://media/external/images/media/123");
        assertFalse(PhotoFileChooser.hasLocationPermission(denied));
        assertEquals(selected, PhotoFileChooser.originalUri(denied, selected));
    }

    @Test
    public void manifestDoesNotRequestLiveLocationOrLibraryWideStorage() throws Exception {
        List<String> permissions = Arrays.asList(context.getPackageManager()
            .getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions);
        assertTrue(permissions.contains("android.permission.ACCESS_MEDIA_LOCATION"));
        for (String forbidden : new String[] {"android.permission.ACCESS_FINE_LOCATION",
                "android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_BACKGROUND_LOCATION",
                "android.permission.READ_MEDIA_IMAGES", "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.MANAGE_EXTERNAL_STORAGE"}) {
            assertFalse("The selected-file contract does not need " + forbidden, permissions.contains(forbidden));
        }
    }

    private void launchWithPhotoLocationPermission() throws Exception {
        assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),
            Manifest.permission.ACCESS_MEDIA_LOCATION);
        scenario = ActivityScenario.launch(new Intent(context, LauncherActivity.class)
            .putExtra(RecordingLauncherActivity.RECORD_DISPATCH, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        scenario.onActivity(created -> {
            activity = created;
            chooser = (PhotoFileChooser) activity.getBridge().getWebView().getWebChromeClient();
        });
        assertTrue(((RecordingLauncherActivity) activity).awaitBlankDocument(5, TimeUnit.SECONDS));
    }

    private void openPicker(android.webkit.ValueCallback<Uri[]> callback) throws Exception {
        instrumentation.getUiAutomation().executeAndWaitForEvent(() ->
            instrumentation.runOnMainSync(() -> chooser.onShowFileChooser(
                activity.getBridge().getWebView(), callback,
                parameters(FileChooserParams.MODE_OPEN, false, "image/jpeg"))),
            event -> event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && event.getPackageName() != null
                && event.getPackageName().toString().endsWith(".documentsui"), 15000);
    }

    @Test
    public void systemCancellationKeepsTheActiveChooserAndCompletesItOnce() throws Exception {
        launchWithPhotoLocationPermission();
        AtomicInteger callbacks = new AtomicInteger();
        CountDownLatch cancelled = new CountDownLatch(1);
        openPicker(result -> {
            assertNull(result);
            callbacks.incrementAndGet();
            cancelled.countDown();
        });
        AtomicInteger rejected = new AtomicInteger();
        instrumentation.runOnMainSync(() -> chooser.onShowFileChooser(activity.getBridge().getWebView(),
            result -> { assertNull(result); rejected.incrementAndGet(); },
            parameters(FileChooserParams.MODE_OPEN, false, "image/jpeg")));
        assertEquals(1, rejected.get());
        assertEquals(0, callbacks.get());
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        assertTrue(cancelled.await(10, TimeUnit.SECONDS));
        instrumentation.runOnMainSync(chooser::dispose);
        assertEquals(1, callbacks.get());
    }

    @Test
    public void destroyingTheActivityCancelsItsPickerOwner() throws Exception {
        launchWithPhotoLocationPermission();
        AtomicInteger callbacks = new AtomicInteger();
        openPicker(result -> { assertNull(result); callbacks.incrementAndGet(); });
        scenario.close();
        scenario = null;
        assertEquals(1, callbacks.get());
        instrumentation.runOnMainSync(chooser::dispose);
        assertEquals(1, callbacks.get());
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
    }

    @Test
    public void actualSystemDocumentSelectionRetainsThePhotosExifLocation() throws Exception {
        launchWithPhotoLocationPermission();
        String token = source.getName().replace(".jpg", "");
        assertTrue("Authorized MediaStore selection explicitly requires original metadata",
            MediaStore.getRequireOriginal(PhotoFileChooser.originalUri(context, fixture)));
        // Exercise the actual Chromium File handoff, not just our native callback.
        WebView view = activity.getBridge().getWebView();
        instrumentation.runOnMainSync(() -> {
            view.getSettings().setJavaScriptEnabled(true);
            view.loadDataWithBaseURL("https://localhost/native-photo-fixture",
                "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<input id='photo' type='file' accept='image/jpeg' aria-label='Choose photo' "
                + "style='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:240px;height:60px'>"
                + "<script>document.getElementById('photo').onchange=async(e)=>{"
                + "window.photoFileEvents=(window.photoFileEvents||0)+1;"
                + "window.photoSelectedCount=e.target.files.length;try{"
                + "const bytes=new Uint8Array(await e.target.files[0].arrayBuffer());"
                + "let binary='';for(const value of bytes)binary+=String.fromCharCode(value);"
                + "window.selectedPhotoBytes=btoa(binary);}catch(error){window.photoReadError=error.name;}};"
                + "</script>", "text/html", "UTF-8", null);
        });
        awaitPhotoInput(view);
        instrumentation.getUiAutomation().executeAndWaitForEvent(() ->
            androidx.test.espresso.Espresso.onView(
                androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom(WebView.class))
                .perform(androidx.test.espresso.action.ViewActions.click()),
            event -> event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && event.getPackageName() != null
                && event.getPackageName().toString().endsWith(".documentsui"), 15000);
        // Document UIs may omit or ellipsize the extension in their displayed title.
        AccessibilityNodeInfo document = findDocument(token);
        captureNativeDiagnostics("native-photo-picker");
        assertNotNull("The real Android document picker exposes the selected fixture", document);
        tapSystemDocument(document);
        byte[] uploadedBytes = selectedFileBytes(view);
        assertArrayEquals("The existing Web File intake receives the original bytes",
            java.nio.file.Files.readAllBytes(source.toPath()), uploadedBytes);
        try (InputStream input = new java.io.ByteArrayInputStream(uploadedBytes)) {
            float[] location = new float[2];
            assertTrue("GPS survives the actual native system selection",
                new ExifInterface(input).getLatLong(location));
            // The platform reader returns floats; the original-byte assertion above is exact.
            assertEquals(52.516667, location[0], 0.00001);
            assertEquals(13.4, location[1], 0.00001);
        }
    }

    private void captureNativeDiagnostics(String label) throws Exception {
        Bitmap screenshot = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(screenshot);
        try (OutputStream proof = new FileOutputStream(new File(context.getFilesDir(), label + ".png"))) {
            screenshot.compress(Bitmap.CompressFormat.PNG, 100, proof);
        }
        java.util.ArrayDeque<AccessibilityNodeInfo> nodes = new java.util.ArrayDeque<>();
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root != null) nodes.add(root);
        StringBuilder hierarchy = new StringBuilder();
        for (int count = 0; count < 500 && !nodes.isEmpty(); count++) {
            AccessibilityNodeInfo node = nodes.remove();
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);
            hierarchy.append(bounds).append(" | ").append(node.getViewIdResourceName()).append(" | ")
                .append(node.getText()).append(" | ").append(node.getContentDescription()).append('\n');
            for (int i = 0; i < node.getChildCount(); i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) nodes.add(child);
            }
        }
        java.nio.file.Files.write(new File(context.getFilesDir(), label + ".txt").toPath(),
            hierarchy.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private byte[] selectedFileBytes(WebView view) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 10000;
        do {
            String encoded = new org.json.JSONArray("[" + javascriptValue(view,
                "window.selectedPhotoBytes||''") + "]").getString(0);
            if (!encoded.isEmpty()) return android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
            instrumentation.waitForIdleSync();
        } while (SystemClock.uptimeMillis() < deadline);
        captureNativeDiagnostics("native-photo-result");
        throw new AssertionError("The selected image never reached the Web File intake: "
            + javascriptValue(view, "JSON.stringify({handler:typeof document.getElementById('photo').onchange,"
                + "events:window.photoFileEvents,count:window.photoSelectedCount,error:window.photoReadError})"));
    }

    private void awaitPhotoInput(WebView view) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 10000;
        do {
            if ("true".equals(javascriptValue(view,
                    "document.getElementById('photo')?.type==='file'"))) return;
            instrumentation.waitForIdleSync();
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("The deterministic file-input DOM never became ready");
    }

    private String javascriptValue(WebView view, String expression) throws Exception {
        CountDownLatch read = new CountDownLatch(1);
        AtomicReference<String> response = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> view.evaluateJavascript(expression, value -> {
            response.set(value);
            read.countDown();
        }));
        assertTrue("Chromium answers the fixture probe", read.await(3, TimeUnit.SECONDS));
        return response.get();
    }

    private void tapSystemDocument(AccessibilityNodeInfo document) throws Exception {
        assertTrue("The identified document is visible", document.isVisibleToUser());
        Rect bounds = new Rect();
        document.getBoundsInScreen(bounds);
        assertFalse("The identified document has touch bounds", bounds.isEmpty());
        // Reuse Android's input command for the real cross-process gesture.
        // Only the identified item's integer screen bounds enter this command.
        String command = "input touchscreen tap " + bounds.centerX() + " " + bounds.centerY();
        try (InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(
                instrumentation.getUiAutomation().executeShellCommand(command))) {
            java.io.ByteArrayOutputStream diagnostics = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int count;
            while ((count = output.read(buffer)) != -1) {
                diagnostics.write(buffer, 0, count);
                assertTrue("System input output stays bounded", diagnostics.size() <= 8192);
            }
            assertEquals("Android accepts the identified document tap", "",
                diagnostics.toString("UTF-8").trim());
        }
    }

    private AccessibilityNodeInfo findDocument(String name) throws Exception {
        UiAutomation automation = instrumentation.getUiAutomation();
        long deadline = SystemClock.uptimeMillis() + 10000;
        do {
            try { automation.waitForIdle(100, 1000); } catch (TimeoutException busy) { /* Await provider content. */ }
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root == null) continue;
            java.util.ArrayDeque<AccessibilityNodeInfo> nodes = new java.util.ArrayDeque<>();
            nodes.add(root);
            for (int count = 0; count < 500 && !nodes.isEmpty(); count++) {
                AccessibilityNodeInfo node = nodes.remove();
                CharSequence text = node.getText();
                CharSequence description = node.getContentDescription();
                if (node.isVisibleToUser() && ((text != null && text.toString().startsWith(name))
                        || (description != null && description.toString().startsWith(name)))) return node;
                for (int i = 0; i < node.getChildCount(); i++) {
                    AccessibilityNodeInfo child = node.getChild(i);
                    if (child != null) nodes.add(child);
                }
            }
        } while (SystemClock.uptimeMillis() < deadline);
        return null;
    }
}
