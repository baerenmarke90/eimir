package de.eimir.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.Manifest;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.ClipData;
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
import android.view.InputDevice;
import android.view.MotionEvent;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.TimeoutException;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.FixMethodOrder;
import org.junit.runners.MethodSorters;

/** Real foreign-owned Android photo grants and Chromium File handoff. */
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
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
        if (source != null) source.delete();
    }

    @BeforeClass
    public static void useForeignOwnedGalleryFixture() throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String selected = InstrumentationRegistry.getArguments().getString("externalPhotoUri");
        assertNotNull("CI seeds a shell-owned camera photo, never an app-owned fixture", selected);
        fixture = Uri.parse(selected);
        if (Build.VERSION.SDK_INT >= 37) {
            assertTrue("The current system image genuinely supports picker metadata consent",
                PhotoFileChooser.supportsPickerMetadata());
        }
        source = new File(context.getCacheDir(), "external-gps-camera.jpg");
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext()
                    .getAssets().open("external-gps-camera.jpg");
                OutputStream output = new FileOutputStream(source)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        try (InputStream ignored = context.getContentResolver().openInputStream(fixture)) {
            fail("The target app must not own or read the external photo before user selection");
        } catch (SecurityException expected) {
            // This is the ownership boundary absent from the previous acceptance.
        }
    }

    @Test
    public void onlyOrdinaryImageInputsUseTheMediaPicker() {
        assertTrue(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN_MULTIPLE,
            false, "image/jpeg", "image/heic", "image/webp")));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, true, "image/*")));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, false)));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, false, "")));
        assertFalse(PhotoFileChooser.isPhotoSelection(parameters(FileChooserParams.MODE_OPEN, false,
            "image/jpeg", "application/pdf")));
        Intent intent = PhotoFileChooser.mediaIntent(context, parameters(FileChooserParams.MODE_OPEN_MULTIPLE,
            false, "image/jpeg", "image/heic"), false);
        assertEquals(Intent.ACTION_GET_CONTENT, intent.getAction());
        assertFalse(intent.hasCategory(Intent.CATEGORY_OPENABLE));
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false));
        assertArrayEquals(new String[] {"image/jpeg", "image/heic"},
            intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));
        assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, intent.getFlags());
        assertFalse(PhotoFileChooser.mediaIntent(context, parameters(FileChooserParams.MODE_OPEN, false,
            "image/jpeg"), false).getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, true));
        Intent modern = PhotoFileChooser.mediaIntent(context,
            parameters(FileChooserParams.MODE_OPEN_MULTIPLE, false, "image/jpeg"), true);
        assertTrue(modern.getBooleanExtra(PhotoFileChooser.REQUEST_LOCATION_METADATA, false));
        assertTrue(modern.getBooleanExtra(PhotoFileChooser.FALLBACK_REQUEST_LOCATION_METADATA, false));
        if (Build.VERSION.SDK_INT >= 33) {
            assertEquals("android.provider.action.PICK_IMAGES", modern.getAction());
        }
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

    private void launchForPhotoSelection(boolean requestPermission) throws Exception {
        assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q);
        if (!requestPermission && !PhotoFileChooser.supportsPickerMetadata()) {
            instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),
                Manifest.permission.ACCESS_MEDIA_LOCATION);
        }
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
                && isSystemPhotoPicker(event.getPackageName()), 15000);
    }

    @Test
    public void systemCancellationKeepsTheActiveChooserAndCompletesItOnce() throws Exception {
        launchForPhotoSelection(false);
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
        if (!cancelled.await(2, TimeUnit.SECONDS)) {
            // Some platform picker sheets consume the first Back to collapse
            // their own selection surface. Only a still-active system picker
            // permits a second genuine Back event; never bypass the chooser.
            AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
            captureNativeDiagnostics("native-photo-after-back");
            assertTrue("Back did not close the picker and the system picker must still be active",
                root != null && isSystemPhotoPicker(root.getPackageName()));
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        }
        assertTrue("System Back must settle the pending photo chooser",
            cancelled.await(10, TimeUnit.SECONDS));
        instrumentation.runOnMainSync(chooser::dispose);
        assertEquals(1, callbacks.get());
    }

    @Test
    public void destroyingTheActivityCancelsItsPickerOwner() throws Exception {
        launchForPhotoSelection(false);
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
    public void actualForeignOwnedPhotoSelectionRetainsItsExifLocation() throws Exception {
        // Alphabetically first: exercise the real optional permission request,
        // before lifecycle tests independently grant their setup permission.
        launchForPhotoSelection(true);
        String token = "Photo taken";
        // Exercise the actual Chromium File handoff, not just our native callback.
        WebView view = activity.getBridge().getWebView();
        // The test Activity already loaded its JavaScript-enabled blank page.
        // Inject the real file input there: navigating to a synthetic localhost
        // path can stall the API 37.1 Chromium fixture behind Capacitor routing.
        String fixtureScript = "(function(){"
            + "document.head.insertAdjacentHTML('beforeend',`<style>#photo::file-selector-button{width:100%;height:100%}</style>`);"
            + "document.body.innerHTML=`<input id='photo' type='file' accept='image/jpeg,image/png,image/webp,image/heic,image/heif' multiple aria-label='Choose photo' "
            + "style='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:240px;height:60px'>`;"
            + "document.getElementById('photo').onchange=async(e)=>{"
            + "window.photoFileEvents=(window.photoFileEvents||0)+1;"
            + "window.photoSelectedCount=e.target.files.length;try{"
            + "const bytes=new Uint8Array(await e.target.files[0].arrayBuffer());"
            + "let binary='';for(const value of bytes)binary+=String.fromCharCode(value);"
            + "window.selectedPhotoBytes=btoa(binary);}catch(error){window.photoReadError=error.name;}};"
            + "return document.getElementById('photo').type==='file';})()";
        assertEquals("Chromium creates the live multiple-photo input", "true",
            javascriptValue(view, fixtureScript));
        awaitPhotoInput(view);
        Rect fileInput = photoInputScreenBounds(view);
        captureNativeDiagnostics("native-photo-input");
        instrumentation.getUiAutomation().executeAndWaitForEvent(() -> {
                try { tapScreenBounds(fileInput); }
                catch (Exception failure) { throw new AssertionError(failure); }
            },
            event -> event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && event.getPackageName() != null
                && (isSystemPhotoPicker(event.getPackageName())
                    || event.getPackageName().toString().contains("permissioncontroller")), 15000);
        AccessibilityNodeInfo root = instrumentation.getUiAutomation().getRootInActiveWindow();
        if (root != null && root.getPackageName() != null
                && root.getPackageName().toString().contains("permissioncontroller")) {
            captureNativeDiagnostics("native-photo-permission");
            AccessibilityNodeInfo allow = findDocument("Allow all");
            assertNotNull("Android exposes the optional metadata permission decision", allow);
            instrumentation.getUiAutomation().executeAndWaitForEvent(() -> {
                // Permission content can precede the dialog's touch input channel.
                // Activate the real consent button through Android accessibility;
                // the system still makes the permission decision and opens its picker.
                assertTrue("The permission decision is still attached", allow.refresh());
                assertTrue("The permission decision is visible", allow.isVisibleToUser());
                assertTrue("The permission decision is enabled", allow.isEnabled());
                assertTrue("Android activates the actual metadata consent button",
                    allow.performAction(AccessibilityNodeInfo.ACTION_CLICK));
            }, event -> event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && event.getPackageName() != null
                && isSystemPhotoPicker(event.getPackageName()), 15000);
        }
        if (PhotoFileChooser.supportsPickerMetadata()) {
            // This is the actual SDK-extension-23 picker consent, not a shell
            // grant of ACCESS_MEDIA_LOCATION or an original-URI override.
            AccessibilityNodeInfo includeLocation = findDocument("Include location");
            captureNativeDiagnostics("native-photo-location-consent");
            assertNotNull("The system picker asks to include the selected photos' location", includeLocation);
            tapNativeControl(includeLocation);
        }
        // Match the actual diary input's complete MIME list and multiple mode.
        AccessibilityNodeInfo document = findDocument(token);
        captureNativeDiagnostics("native-photo-picker");
        assertNotNull("The real Android photo picker exposes the foreign-owned fixture", document);
        tapNativeControl(document);
        // SDK-extension-23 pickers label the final selection action "Done";
        // older system photo pickers use "Add". Both are explicit confirmation.
        String confirmLabel = PhotoFileChooser.supportsPickerMetadata() ? "Done" : "Add";
        AccessibilityNodeInfo confirm = findDocument(confirmLabel);
        captureNativeDiagnostics("native-photo-confirmation");
        assertNotNull("The system picker requires explicit selection confirmation: " + confirmLabel,
            confirm);
        tapNativeControl(confirm);
        byte[] uploadedBytes = selectedFileBytes(view);
        java.nio.file.Files.write(new File(context.getFilesDir(), "native-selected-photo.jpg").toPath(), uploadedBytes);
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

    private static boolean isSystemPhotoPicker(CharSequence packageName) {
        return packageName != null && (packageName.toString().contains("providers.media")
            || packageName.toString().endsWith(".photopicker"));
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
        if (!read.await(10, TimeUnit.SECONDS)) {
            captureNativeDiagnostics("native-photo-dom");
            AtomicReference<String> state = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> state.set("url=" + view.getUrl()
                + ", progress=" + view.getProgress() + ", attached=" + view.isAttachedToWindow()
                + ", visible=" + view.isShown() + ", focus=" + view.hasWindowFocus()
                + ", javascript=" + view.getSettings().getJavaScriptEnabled()));
            throw new AssertionError("Chromium must answer the fixture probe: " + state.get());
        }
        return response.get();
    }

    private Rect photoInputScreenBounds(WebView view) throws Exception {
        // A live WebView can render correctly without exposing virtual accessibility
        // children. Read geometry only; activation still uses a genuine native tap.
        CountDownLatch visualState = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> view.postVisualStateCallback(1,
            new WebView.VisualStateCallback() {
                @Override public void onComplete(long requestId) { visualState.countDown(); }
            }));
        assertTrue("Chromium commits the file input's visual state",
            visualState.await(10, TimeUnit.SECONDS));
        String geometryJson = new org.json.JSONArray("[" + javascriptValue(view,
            "JSON.stringify((()=>{const r=document.getElementById('photo').getBoundingClientRect();"
                + "return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]})())") + "]").getString(0);
        org.json.JSONArray geometry = new org.json.JSONArray(geometryJson);
        AtomicReference<Rect> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            assertTrue("The real WebView is visible and attached", view.isShown() && view.isAttachedToWindow());
            int[] origin = new int[2];
            view.getLocationOnScreen(origin);
            double scaleX = view.getWidth() / geometry.optDouble(4);
            double scaleY = view.getHeight() / geometry.optDouble(5);
            assertTrue("The CSS viewport maps to finite native pixels",
                Double.isFinite(scaleX) && scaleX > 0 && Double.isFinite(scaleY) && scaleY > 0);
            result.set(new Rect(
                origin[0] + (int) Math.round(geometry.optDouble(0) * scaleX),
                origin[1] + (int) Math.round(geometry.optDouble(1) * scaleY),
                origin[0] + (int) Math.round(geometry.optDouble(2) * scaleX),
                origin[1] + (int) Math.round(geometry.optDouble(3) * scaleY)));
            assertTrue("The native file-input touch target stays inside the WebView",
                new Rect(origin[0], origin[1], origin[0] + view.getWidth(), origin[1] + view.getHeight())
                    .contains(result.get()));
        });
        return result.get();
    }

    private void tapNativeControl(AccessibilityNodeInfo document) throws Exception {
        // Consent banners and diagnostic screenshots can move a previously found node.
        assertTrue("The identified system control is still attached", document.refresh());
        assertTrue("The identified document is visible", document.isVisibleToUser());
        Rect bounds = new Rect();
        document.getBoundsInScreen(bounds);
        tapScreenBounds(bounds);
    }

    private void tapScreenBounds(Rect bounds) throws Exception {
        assertFalse("The identified document has touch bounds", bounds.isEmpty());
        // Public UiAutomation input waits for platform window/surface transitions.
        // Queue one tap without an Espresso down/up idle gap becoming a long press.
        // Match Android's tap event timestamps; no sleep or gesture retry is needed.
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN,
            bounds.centerX(), bounds.centerY(), 0);
        MotionEvent up = MotionEvent.obtain(now, now, MotionEvent.ACTION_UP,
            bounds.centerX(), bounds.centerY(), 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try {
            UiAutomation automation = instrumentation.getUiAutomation();
            assertTrue("Android accepts the identified control's touch down",
                automation.injectInputEvent(down, false));
            assertTrue("Android accepts the identified control's touch up",
                automation.injectInputEvent(up, true));
        } finally {
            down.recycle();
            up.recycle();
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
                if (node.isVisibleToUser() && ((text != null && (("Allow all".equals(name) || "Include location".equals(name))
                        ? text.toString().equals(name) : text.toString().startsWith(name)))
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
