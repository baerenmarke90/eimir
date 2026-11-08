package de.eimir.app;

import static org.junit.Assert.*;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.job.JobInfo;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;

/** Actual selected-file staging, revoked ownership and OS background transport. */
public class BackgroundMediaTransfersTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final String account = UUID.randomUUID().toString();
    private final String space = UUID.randomUUID().toString();
    private final String id = UUID.randomUUID().toString();
    private String instance = "https://media-fixture.eimir.invalid";
    private File selected;
    private SelectedMediaProvider.Owner owner;

    private void session(String accountId) throws Exception {
        JSONObject snapshot = new JSONObject().put("account", new JSONObject().put("id", accountId).put("locale", "en"))
            .put("spaceId", space).put("tokens", new JSONObject().put("accessToken", "synthetic-transfer-token")
                .put("accessExpiresAt", Instant.now().plusSeconds(600).toString()));
        AtomicFile file = NativeSessionStoragePlugin.file(context, instance);
        FileOutputStream output = file.startWrite();
        output.write(NativeSessionCipher.encrypt(NativeSessionStoragePlugin.key(), instance, snapshot.toString()));
        file.finishWrite(output);
    }
    private String selection(int size) throws Exception {
        selected = new File(context.getCacheDir(), "private-selected-video.mp4");
        byte[] block = new byte[64 * 1024];
        for (int i = 0; i < block.length; i++) block[i] = (byte) (i % 251);
        try (FileOutputStream output = new FileOutputStream(selected)) {
            for (int written = 0; written < size; written += block.length)
                output.write(block, 0, Math.min(block.length, size - written));
        }
        Uri original = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", selected);
        owner = new SelectedMediaProvider.Owner();
        Uri adopted = owner.adopt(context, original);
        assertNotEquals(original, adopted);
        try (Cursor cursor = context.getContentResolver().query(adopted, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            assertNotNull(cursor); assertTrue(cursor.moveToFirst()); return cursor.getString(0);
        }
    }
    private BackgroundMediaTransfers.Record stage(String sourceName) throws Exception {
        return BackgroundMediaTransfers.stage(context, instance, account, space, id, sourceName, selected.length(), "video/mp4");
    }
    @After public void cleanup() throws Exception {
        BackgroundMediaTransfers.cancel(context, id);
        NativeSessionStoragePlugin.clearSnapshot(context, instance);
        if (owner != null) owner.close();
        if (selected != null) selected.delete();
        context.getSystemService(NotificationManager.class).cancelAll();
    }
    @Test public void stagingOutlivesSelectionAndHasNoContentBearingRecord() throws Exception {
        session(account);
        String name = selection(128 * 1024);
        assertFalse(name.contains("private-selected"));
        BackgroundMediaTransfers.Record record = stage(name);
        owner.close();
        assertArrayEquals(Files.readAllBytes(selected.toPath()), Files.readAllBytes(BackgroundMediaTransfers.source(context, id).toPath()));
        File encrypted = new File(context.getNoBackupFilesDir(), "media-transfers-v1/" + id + ".job");
        String bytes = new String(Files.readAllBytes(encrypted.toPath()), StandardCharsets.ISO_8859_1);
        assertFalse(bytes.contains(instance)); assertFalse(bytes.contains(account));
        assertFalse(record.value.toString().contains("synthetic-transfer-token"));
        assertFalse(record.value.toString().contains("private-selected"));
        assertEquals(1, BackgroundMediaTransfers.list(context, instance, account, space).length());
        if (Build.VERSION.SDK_INT >= 34) {
            JobInfo job = BackgroundMediaTransfers.userInitiatedJob(context, record);
            assertTrue(job.isUserInitiated()); assertNotNull(job.getRequiredNetwork());
            assertEquals(selected.length(), job.getEstimatedNetworkUploadBytes());
            assertEquals(id, job.getExtras().getString("attachmentId"));
        }
    }
    @Test public void stagingRejectsUnselectedBytesAndChangedOwner() throws Exception {
        session(account); String name = selection(128 * 1024);
        try { stage("eimir-selected-" + UUID.randomUUID() + ".mp4"); fail("An opaque name is not a selected-file grant"); }
        catch (java.io.FileNotFoundException expected) { assertFalse(BackgroundMediaTransfers.source(context, id).exists()); }
        session(UUID.randomUUID().toString());
        try { stage(name); fail("A new account cannot adopt the old selection"); }
        catch (java.io.IOException expected) { assertFalse(BackgroundMediaTransfers.source(context, id).exists()); }
    }
    @Test public void logoutPurgesStagingAndLateProgressCannotRecreateIt() throws Exception {
        session(account); stage(selection(128 * 1024));
        NativeSessionStoragePlugin.clearSnapshot(context, instance);
        assertFalse(BackgroundMediaTransfers.source(context, id).exists());
        assertFalse(NativeSessionStoragePlugin.file(context, instance).getBaseFile().exists());
        try { BackgroundMediaTransfers.update(context, id, "uploading", 50); fail("Revoked transfer must remain absent"); }
        catch (java.io.InterruptedIOException expected) { /* Revocation is authoritative. */ }
        try { BackgroundMediaTransfers.read(context, id); fail("No record may reappear"); }
        catch (java.io.FileNotFoundException expected) { /* No credential or record remains. */ }
    }
    @Test public void nativeUploadContinuesWithProgressWhileActivityIsInBackground() throws Exception {
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(
                "pm grant " + context.getPackageName() + " " + Manifest.permission.POST_NOTIFICATIONS).close();
        }
        try (TransferServer server = new TransferServer(); ActivityScenario<LauncherActivity> scenario = ActivityScenario.launch(LauncherActivity.class)) {
            instance = "http://127.0.0.1:" + server.socket.getLocalPort();
            session(account);
            String name = selection(16 * 1024 * 1024);
            byte[] expectedDigest = MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(selected.toPath()));
            BackgroundMediaTransfers.Record record = stage(name);
            AtomicReference<Exception> admissionError = new AtomicReference<>();
            scenario.onActivity(activity -> { try { BackgroundMediaTransfers.schedule(context, record); } catch (Exception failure) { admissionError.set(failure); } });
            if (admissionError.get() != null) throw admissionError.get();
            assertTrue("Real native PUT must begin", server.started.await(25, TimeUnit.SECONDS));
            owner.close();
            UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
            assertTrue(device.pressHome());
            await(() -> !MainActivity.isForeground(), 10_000);
            NotificationManager notifications = context.getSystemService(NotificationManager.class);
            await(() -> Arrays.stream(notifications.getActiveNotifications()).anyMatch(item -> item.getNotification().extras.getInt(Notification.EXTRA_PROGRESS) > 0), 10_000);
            Notification notification = Arrays.stream(notifications.getActiveNotifications()).filter(item ->
                item.getId() == (Build.VERSION.SDK_INT >= 34 ? record.jobId() : BackgroundMediaTransfers.FOREGROUND_NOTIFICATION)).findFirst().orElseThrow().getNotification();
            assertEquals(Notification.VISIBILITY_SECRET, notification.visibility);
            assertEquals(100, notification.extras.getInt(Notification.EXTRA_PROGRESS_MAX));
            assertFalse(notification.extras.toString().contains("private-selected"));
            assertFalse(notification.extras.toString().contains(account));
            assertTrue(device.openNotification()); device.waitForIdle();
            assertTrue(device.takeScreenshot(new File(context.getFilesDir(), "native-media-upload-background.png")));
            server.release.countDown();
            assertTrue("Background PUT and finalize must finish", server.finished.await(25, TimeUnit.SECONDS));
            if (server.error.get() != null) throw new AssertionError(server.error.get());
            await(() -> { try { return !BackgroundMediaTransfers.source(context, id).exists(); } catch (Exception failure) { return false; } }, 10_000);
            assertArrayEquals(expectedDigest, server.digest);
            assertEquals(1, server.finalizes);
            assertFalse(MainActivity.isForeground());
            device.pressBack();
        }
    }
    private static void await(BooleanSupplier condition, long timeout) {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        while (!condition.getAsBoolean() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(20);
        assertTrue("Platform state did not reach the expected boundary", condition.getAsBoolean());
    }
    private static final class TransferServer implements AutoCloseable {
        final ServerSocket socket = new ServerSocket(0, 4, java.net.InetAddress.getByName("127.0.0.1"));
        final CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1), finished = new CountDownLatch(1);
        final AtomicReference<Throwable> error = new AtomicReference<>();
        byte[] digest; int finalizes;
        final Thread thread;
        TransferServer() throws Exception {
            socket.setSoTimeout(30_000);
            thread = new Thread(() -> {
                try {
                    for (int request = 0; request < 3; request++) try (Socket connection = socket.accept()) {
                        connection.setSoTimeout(30_000);
                        InputStream input = new BufferedInputStream(connection.getInputStream());
                        String first = line(input); int length = 0;
                        for (String header = line(input); !header.isEmpty(); header = line(input))
                            if (header.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(header.substring(15).trim());
                        if (first.startsWith("PUT ")) {
                            MessageDigest hash = MessageDigest.getInstance("SHA-256"); byte[] block = new byte[64 * 1024];
                            int remaining = length;
                            while (remaining > 0) {
                                int count = input.read(block, 0, Math.min(remaining, block.length));
                                if (count < 0) throw new java.io.EOFException();
                                hash.update(block, 0, count); remaining -= count;
                                if (started.getCount() > 0) { started.countDown(); if (!release.await(25, TimeUnit.SECONDS)) throw new java.io.IOException("Fixture transfer was not released"); }
                            }
                            digest = hash.digest(); respond(connection, 204, "");
                        } else if (first.startsWith("POST ")) {
                            assertTrue(first.contains("/finalize ")); assertEquals(2, length); assertEquals('{', input.read()); assertEquals('}', input.read());
                            finalizes++; respond(connection, 202, "{\"status\":\"PROCESSING\"}");
                        } else { assertTrue(first.startsWith("GET ")); respond(connection, 200, "{\"status\":\"PENDING\"}"); }
                    }
                } catch (Throwable failure) { error.set(failure); }
                finally { finished.countDown(); }
            }, "native-transfer-fixture");
            thread.start();
        }
        private static String line(InputStream input) throws Exception {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); int value;
            while ((value = input.read()) != -1) { if (value == '\n') break; if (value != '\r') bytes.write(value); if (bytes.size() > 8192) throw new java.io.IOException("Oversized fixture header"); }
            if (value == -1) throw new java.io.EOFException();
            return bytes.toString("US-ASCII");
        }
        private static void respond(Socket connection, int status, String body) throws Exception {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.getOutputStream().write(("HTTP/1.1 " + status + " OK\r\nContent-Type: application/json\r\nContent-Length: " + bytes.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            connection.getOutputStream().write(bytes); connection.getOutputStream().flush();
        }
        @Override public void close() throws Exception { release.countDown(); socket.close(); thread.join(1000); }
    }
}
