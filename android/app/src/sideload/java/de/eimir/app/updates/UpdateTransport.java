package de.eimir.app.updates;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Bounded public HTTPS reads. Never receives product credentials or Web URLs. */
final class UpdateTransport implements UpdateCatalog.Reader {
    interface Progress { void changed(long bytes); }
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private volatile HttpsURLConnection connection;
    interface ConnectionFactory { HttpsURLConnection open(String url) throws Exception; }
    private final ConnectionFactory connections;
    private final LongSupplier elapsedTime;
    private final long checkTimeoutMillis;
    private final ScheduledThreadPoolExecutor deadlines;
    private long checkDeadline;

    UpdateTransport() {
        this(url -> (HttpsURLConnection) new URL(url).openConnection(),
            System::nanoTime, UpdatePolicy.CHECK_TIMEOUT_MILLIS);
    }

    UpdateTransport(ConnectionFactory connections, LongSupplier elapsedTime, long checkTimeoutMillis) {
        this.connections = connections;
        this.elapsedTime = elapsedTime;
        this.checkTimeoutMillis = checkTimeoutMillis;
        deadlines = new ScheduledThreadPoolExecutor(1, runnable -> {
            Thread thread = new Thread(runnable, "eimir-update-deadline");
            thread.setDaemon(true);
            return thread;
        });
        deadlines.setRemoveOnCancelPolicy(true);
    }

    void reset() { cancelled.set(false); checkDeadline = 0; }
    void close() { cancel(); deadlines.shutdownNow(); }
    boolean isCancelled() { return cancelled.get(); }

    void cancel() {
        cancelled.set(true);
        HttpsURLConnection current = connection;
        if (current != null) current.disconnect();
    }

    public void ensureActive() {
        if (cancelled.get() || Thread.currentThread().isInterrupted()) throw new CancellationException();
    }

    public String readJson(String url, int limit) throws Exception {
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        if (checkDeadline == 0) {
            checkDeadline = elapsedTime.getAsLong() + TimeUnit.MILLISECONDS.toNanos(checkTimeoutMillis);
        }
        transfer(url, result, limit, -1, checkDeadline, null, bytes -> {});
        return result.toString(StandardCharsets.UTF_8.name());
    }

    void download(String url, File destination, long expectedSize, String sha256, Progress progress)
        throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileOutputStream output = new FileOutputStream(destination)) {
            transfer(url, output, expectedSize, expectedSize,
                elapsedTime.getAsLong() + TimeUnit.MINUTES.toNanos(15), digest, progress);
            output.getFD().sync();
        }
        if (!UpdatePolicy.validDigest(digest.digest(), sha256)) throw new IOException("INTEGRITY");
        ensureActive();
    }

    private long remaining(long deadline) throws IOException {
        ensureActive();
        long remaining = deadline - elapsedTime.getAsLong();
        if (remaining <= 0) throw new IOException("NETWORK");
        return remaining;
    }

    private int socketTimeout(long deadline) throws IOException {
        return (int) Math.min(15_000L, Math.max(1L,
            TimeUnit.NANOSECONDS.toMillis(remaining(deadline))));
    }

    private void transfer(String initialUrl, OutputStream output, long limit, long expectedSize,
        long deadline, MessageDigest digest, Progress progress) throws Exception {
        String url = initialUrl;
        for (int redirects = 0; redirects <= 5; redirects++) {
            remaining(deadline);
            if (!UpdatePolicy.allowedTransportUrl(url)) throw new IOException("INVALID_RELEASE");
            HttpsURLConnection current = connections.open(url);
            connection = current;
            ScheduledFuture<?> expiry = null;
            try {
                // Capture this connection so an old deadline cannot abort a newer request.
                expiry = deadlines.schedule(current::disconnect, remaining(deadline), TimeUnit.NANOSECONDS);
                current.setInstanceFollowRedirects(false);
                current.setConnectTimeout(socketTimeout(deadline));
                current.setReadTimeout(socketTimeout(deadline));
                current.setRequestProperty("User-Agent", "eimir-android-test-updates");
                current.setRequestProperty("Accept",
                    "application/atom+xml, application/json, application/octet-stream");
                current.setRequestProperty("Accept-Encoding", "identity");
                current.setUseCaches(false);
                int status = current.getResponseCode();
                remaining(deadline);
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = current.getHeaderField("Location");
                    if (location == null) throw new IOException("NETWORK");
                    url = new URL(new URL(url), location).toString();
                    continue;
                }
                // A missing release asset is a distinct, non-transient answer for callers that skip it.
                if (status == 404) throw new FileNotFoundException("NETWORK");
                if (status != 200) throw new IOException("NETWORK");
                long declared = current.getContentLengthLong();
                if (declared > limit || (expectedSize >= 0 && declared >= 0 && declared != expectedSize)) {
                    throw new IOException("INTEGRITY");
                }
                long total = 0;
                long lastProgress = 0;
                try (InputStream input = current.getInputStream()) {
                    byte[] buffer = new byte[64 * 1024];
                    int count;
                    while (true) {
                        current.setReadTimeout(socketTimeout(deadline));
                        count = input.read(buffer);
                        remaining(deadline);
                        if (count == -1) break;
                        total += count;
                        if (total > limit) throw new IOException("INTEGRITY");
                        output.write(buffer, 0, count);
                        if (digest != null) digest.update(buffer, 0, count);
                        if (elapsedTime.getAsLong() - lastProgress >= 200_000_000L) {
                            progress.changed(total);
                            lastProgress = elapsedTime.getAsLong();
                        }
                    }
                }
                remaining(deadline);
                if (expectedSize >= 0 && total != expectedSize) throw new IOException("INTEGRITY");
                progress.changed(total);
                return;
            } finally {
                if (expiry != null) expiry.cancel(false);
                current.disconnect();
                if (connection == current) connection = null;
            }
        }
        throw new IOException("NETWORK");
    }
}
