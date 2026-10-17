package de.eimir.app.updates;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Bounded public HTTPS reads. Never receives product credentials or Web URLs. */
final class UpdateTransport implements UpdateCatalog.Reader {
    interface Progress { void changed(long bytes); }
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private volatile HttpsURLConnection connection;

    void reset() { cancelled.set(false); }
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
        transfer(url, result, limit, -1, 60_000L, null, bytes -> {});
        return result.toString(StandardCharsets.UTF_8.name());
    }

    void download(String url, File destination, long expectedSize, String sha256, Progress progress)
        throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileOutputStream output = new FileOutputStream(destination)) {
            transfer(url, output, expectedSize, expectedSize, 15 * 60_000L, digest, progress);
            output.getFD().sync();
        }
        if (!UpdatePolicy.validDigest(digest.digest(), sha256)) throw new IOException("INTEGRITY");
        ensureActive();
    }

    private void transfer(String initialUrl, OutputStream output, long limit, long expectedSize,
        long timeout, MessageDigest digest, Progress progress) throws Exception {
        long deadline = System.nanoTime() + timeout * 1_000_000L;
        String url = initialUrl;
        try {
            for (int redirects = 0; redirects <= 5; redirects++) {
                ensureActive();
                if (!UpdatePolicy.allowedTransportUrl(url)) throw new IOException("INVALID_RELEASE");
                HttpsURLConnection current = (HttpsURLConnection) new URL(url).openConnection();
                connection = current;
                current.setInstanceFollowRedirects(false);
                current.setConnectTimeout(15_000);
                current.setReadTimeout(15_000);
                current.setRequestProperty("User-Agent", "eimir-android-test-updates");
                current.setRequestProperty("Accept", "application/json, application/octet-stream");
                current.setRequestProperty("Accept-Encoding", "identity");
                current.setUseCaches(false);
                int status = current.getResponseCode();
                ensureActive();
                if (System.nanoTime() > deadline) throw new IOException("NETWORK");
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = current.getHeaderField("Location");
                    if (location == null) throw new IOException("NETWORK");
                    url = new URL(new URL(url), location).toString();
                    current.disconnect();
                    continue;
                }
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
                    while ((count = input.read(buffer)) != -1) {
                        ensureActive();
                        if (System.nanoTime() > deadline) throw new IOException("NETWORK");
                        total += count;
                        if (total > limit) throw new IOException("INTEGRITY");
                        output.write(buffer, 0, count);
                        if (digest != null) digest.update(buffer, 0, count);
                        if (System.nanoTime() - lastProgress >= 200_000_000L) {
                            progress.changed(total);
                            lastProgress = System.nanoTime();
                        }
                    }
                }
                ensureActive();
                if (expectedSize >= 0 && total != expectedSize) throw new IOException("INTEGRITY");
                progress.changed(total);
                return;
            }
            throw new IOException("NETWORK");
        } finally {
            HttpsURLConnection current = connection;
            connection = null;
            if (current != null) current.disconnect();
        }
    }
}
