package de.eimir.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Streams a Plan PDF to a temporary file and grants a system viewer read access. */
@CapacitorPlugin(name = "PlanFiles")
public class PlanFilesPlugin extends Plugin {
    private static final String PDF = "application/pdf";
    private static final String FILE_ID = "[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}";
    private static final Pattern CONTENT_PATH = Pattern.compile(
        ".*/api/v1/spaces/" + FILE_ID + "/attachments/" + FILE_ID + "/content");
    private static final int MAX_PDF_BYTES = 25 * 1024 * 1024;
    private static final long MAX_CACHE_AGE_MS = TimeUnit.HOURS.toMillis(1);

    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<Intent> viewer;
    private volatile File viewing;
    private volatile boolean destroyed;

    @Override
    public void load() {
        viewer = bridge.registerForActivityResult(new ActivityResultContracts.StartActivityForResult(),
            result -> releaseViewer());
        downloads.execute(this::pruneCache);
    }

    @PluginMethod
    public void preparePdf(PluginCall call) {
        String authorization = call.getString("authorization");
        Integer size = call.getInt("size");
        URL url = contentUrl(call.getString("url"));
        if (destroyed || url == null || authorization == null || !authorization.startsWith("Bearer ")
                || size == null || size <= 0 || size > MAX_PDF_BYTES) {
            call.reject("Invalid PDF request.");
            return;
        }
        downloads.execute(() -> {
            try {
                call.resolve(download(url, authorization, size));
            } catch (IOException | RuntimeException unavailable) {
                call.reject("The PDF could not be downloaded.");
            }
        });
    }

    static URL contentUrl(String value) {
        if (value == null) return null;
        try {
            URL url = new URL(value);
            if (!("https".equals(url.getProtocol()) || "http".equals(url.getProtocol()))
                    || url.getHost().isEmpty() || url.getUserInfo() != null || url.getQuery() != null
                    || url.getRef() != null || !CONTENT_PATH.matcher(url.getPath()).matches()) return null;
            return url;
        } catch (MalformedURLException invalid) {
            return null;
        }
    }

    private JSObject download(URL url, String authorization, int size) throws IOException {
        pruneCache();
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Authorization", authorization);
        connection.setRequestProperty("Accept", PDF);
        connection.setRequestProperty("Accept-Encoding", "identity");
        try {
            int status = connection.getResponseCode();
            JSObject result = new JSObject().put("status", status);
            if (status >= 400 && status <= 599) return result;
            long length = connection.getContentLengthLong();
            if (status != HttpURLConnection.HTTP_OK || !PDF.equals(connection.getContentType())
                    || (length >= 0 && length != size)) throw new IOException("Invalid PDF response.");

            File directory = cacheDirectory();
            if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
                throw new IOException("PDF cache unavailable.");
            }
            String id = UUID.randomUUID().toString();
            File file = fileFor(id);
            boolean ready = false;
            try {
                try (InputStream source = connection.getInputStream();
                        FileOutputStream target = new FileOutputStream(file)) {
                    byte[] buffer = new byte[64 * 1024];
                    int received = 0;
                    int count;
                    while ((count = source.read(buffer)) != -1) {
                        received += count;
                        if (received > size || destroyed) throw new IOException("PDF transfer interrupted.");
                        target.write(buffer, 0, count);
                    }
                    if (received != size || destroyed) throw new IOException("Incomplete PDF response.");
                }
                ready = true;
                return result.put("fileId", id);
            } finally {
                if (!ready) file.delete();
            }
        } finally {
            connection.disconnect();
        }
    }

    @PluginMethod
    public void openPdf(PluginCall call) {
        File file = fileFor(call.getString("fileId"));
        String name = call.getString("name");
        bridge.executeOnMainThread(() -> {
            if (destroyed || viewing != null || file == null || !file.isFile() || name == null) {
                call.reject("The PDF is unavailable.");
                return;
            }
            try {
                Context context = getContext();
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file, name);
                viewing = file;
                viewer.launch(viewIntent(uri));
                call.resolve();
            } catch (ActivityNotFoundException missing) {
                releaseViewer();
                call.reject("No PDF viewer is installed.", "NO_PDF_VIEWER");
            } catch (RuntimeException unavailable) {
                releaseViewer();
                call.reject("The PDF could not be opened.");
            }
        });
    }

    static Intent viewIntent(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, PDF)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri("PDF", uri));
        return intent;
    }

    @PluginMethod
    public void discardPdf(PluginCall call) {
        File file = fileFor(call.getString("fileId"));
        if (file != null && !file.equals(viewing)) file.delete();
        call.resolve();
    }

    private File cacheDirectory() {
        return new File(getContext().getCacheDir(), "plan-pdfs");
    }

    private File fileFor(String id) {
        return id != null && id.matches(FILE_ID) ? new File(cacheDirectory(), id + ".pdf") : null;
    }

    private void pruneCache() {
        long cutoff = System.currentTimeMillis() - MAX_CACHE_AGE_MS;
        File[] files = cacheDirectory().listFiles();
        if (files == null) return;
        for (File file : files) {
            if (!file.equals(viewing) && file.lastModified() < cutoff) file.delete();
        }
    }

    private void releaseViewer() {
        File file = viewing;
        viewing = null;
        if (file != null) file.delete();
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        downloads.shutdownNow();
        releaseViewer();
        super.handleOnDestroy();
    }
}
