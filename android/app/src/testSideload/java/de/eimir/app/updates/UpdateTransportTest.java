package de.eimir.app.updates;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.security.cert.Certificate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import javax.net.ssl.HttpsURLConnection;
import org.junit.Test;

public class UpdateTransportTest {
    private static final String RELEASE_ASSET =
        UpdatePolicy.releaseUrl("android-test-v0.2.0-test.1", UpdatePolicy.MARKER);

    private static final class Connection extends HttpsURLConnection {
        final byte[] body;
        final CountDownLatch entered = new CountDownLatch(1), disconnected = new CountDownLatch(1);
        final boolean blocked;
        final int status;
        Connection(boolean blocked) throws Exception { this(blocked, 200); }
        Connection(boolean blocked, int status) throws Exception {
            super(new URL(UpdatePolicy.FEED_URL));
            this.blocked = blocked;
            this.status = status;
            body = "[]".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }
        public void connect() {}
        public void disconnect() { disconnected.countDown(); }
        public boolean usingProxy() { return false; }
        public String getCipherSuite() { return "TLS_TEST"; }
        public Certificate[] getLocalCertificates() { return null; }
        public Certificate[] getServerCertificates() { return new Certificate[0]; }
        public int getResponseCode() { return status; }
        public long getContentLengthLong() { return blocked ? -1 : body.length; }
        public InputStream getInputStream() {
            if (!blocked) return new ByteArrayInputStream(body);
            return new InputStream() {
                public int read() throws IOException {
                    entered.countDown();
                    try {
                        if (!disconnected.await(3, TimeUnit.SECONDS)) throw new IOException("Test connection was not aborted");
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        throw new IOException("NETWORK");
                    }
                    throw new IOException("NETWORK");
                }
            };
        }
    }

    @Test public void releaseDownloadRequestsKeepSocketBoundsAndCloseTheirConnection() throws Exception {
        Connection connection = new Connection(false);
        UpdateTransport transport = new UpdateTransport(url -> connection, System::nanoTime, 5_000);
        try {
            assertEquals("[]", transport.readJson(RELEASE_ASSET, 8));
            assertEquals("application/atom+xml, application/json, application/octet-stream",
                connection.getRequestProperty("Accept"));
            assertNull(connection.getRequestProperty("Authorization"));
            assertTrue(connection.getConnectTimeout() > 0 && connection.getConnectTimeout() <= 5_000);
            assertTrue(connection.getReadTimeout() > 0 && connection.getReadTimeout() <= 5_000);
            assertEquals(0, connection.disconnected.getCount());
        } finally { transport.close(); }
    }

    @Test public void aMissingReleaseAssetIsReportedAsNotFoundWhileOtherErrorsStayGeneric() throws Exception {
        UpdateTransport missing = new UpdateTransport(url -> new Connection(false, 404), System::nanoTime, 5_000);
        UpdateTransport broken = new UpdateTransport(url -> new Connection(false, 500), System::nanoTime, 5_000);
        try {
            assertEquals("NETWORK", assertThrows(java.io.FileNotFoundException.class,
                () -> missing.readJson(RELEASE_ASSET, 8)).getMessage());
            IOException failure = assertThrows(IOException.class, () -> broken.readJson(RELEASE_ASSET, 8));
            assertFalse(failure instanceof java.io.FileNotFoundException);
            assertEquals("NETWORK", failure.getMessage());
        } finally { missing.close(); broken.close(); }
    }

    @Test public void metadataRequestsShareOneDeadlineAndAnExplicitRetryGetsANewBudget() throws Exception {
        AtomicLong clock = new AtomicLong(1);
        AtomicInteger requests = new AtomicInteger();
        UpdateTransport transport = new UpdateTransport(url -> {
            requests.incrementAndGet();
            return new Connection(false);
        }, clock::get, 5_000);
        try {
            assertEquals("[]", transport.readJson(UpdatePolicy.FEED_URL, 8));
            clock.addAndGet(TimeUnit.MILLISECONDS.toNanos(5_001));
            assertEquals("NETWORK", assertThrows(IOException.class,
                () -> transport.readJson(RELEASE_ASSET, 8)).getMessage());
            assertEquals(1, requests.get());
            transport.reset();
            assertEquals("[]", transport.readJson(UpdatePolicy.FEED_URL, 8));
            assertEquals(2, requests.get());
        } finally { transport.close(); }
    }

    @Test(timeout = 4_000) public void searchDeadlineActivelyAbortsBlockedNetworkReads() throws Exception {
        Connection connection = new Connection(true);
        UpdateTransport transport = new UpdateTransport(url -> connection, System::nanoTime, 250);
        try {
            long start = System.nanoTime();
            assertThrows(IOException.class, () -> transport.readJson(UpdatePolicy.FEED_URL, 8));
            assertTrue(connection.entered.getCount() == 0);
            assertEquals(0, connection.disconnected.getCount());
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 2_500);
        } finally { transport.close(); }
    }

    @Test(timeout = 4_000) public void cancellationDisconnectsTheOwnedRequestWithoutClearingItsState() throws Exception {
        Connection connection = new Connection(true);
        UpdateTransport transport = new UpdateTransport(url -> connection, System::nanoTime, 5_000);
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<String> result = worker.submit(() -> transport.readJson(UpdatePolicy.FEED_URL, 8));
            assertTrue(connection.entered.await(2, TimeUnit.SECONDS));
            transport.cancel();
            assertThrows(ExecutionException.class, () -> result.get(1, TimeUnit.SECONDS));
            assertTrue(transport.isCancelled());
            assertEquals(0, connection.disconnected.getCount());
        } finally { transport.close(); worker.shutdownNow(); }
    }

    @Test public void transportRetainsByteAndDigestChecksForTheRawApkRequest() throws Exception {
        UpdateTransport transport = new UpdateTransport(url -> new Connection(false), System::nanoTime, 5_000);
        File file = File.createTempFile("eimir-updater-", ".apk");
        try {
            assertEquals("INTEGRITY", assertThrows(IOException.class,
                () -> transport.readJson(RELEASE_ASSET, 1)).getMessage());
            transport.reset();
            assertEquals("INTEGRITY", assertThrows(IOException.class,
                () -> transport.download(RELEASE_ASSET, file, 2, "a".repeat(64), bytes -> {})).getMessage());
        } finally { transport.close(); file.delete(); }
    }
}
