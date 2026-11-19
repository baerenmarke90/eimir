package de.eimir.app;

import android.content.Context;
import android.net.Uri;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.IOException;
import java.util.UUID;

/**
 * Short-lived camera targets for a Web {@code capture} request (#2048).
 *
 * A photo taken for a one-time message must never reach the shared gallery or
 * linger in app storage. The camera writes into a private cache folder that is
 * not indexed by MediaStore; the folder is emptied before every new capture and
 * when the app starts, so at most the photo of the current composer exists.
 */
final class PhotoCapture {
    static final String FOLDER = "web-capture";

    private PhotoCapture() {}

    /** A fresh, empty target the camera app may write the JPEG into. */
    static Uri newTarget(Context context) throws IOException {
        File folder = folder(context);
        clear(folder);
        if (!folder.isDirectory() && !folder.mkdirs()) {
            throw new IOException("Capture folder unavailable");
        }
        File target = new File(folder, UUID.randomUUID() + ".jpg");
        if (!target.createNewFile()) throw new IOException("Capture target unavailable");
        return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", target);
    }

    /** Removes every earlier capture; called on app start and before a new one. */
    static void clear(Context context) {
        clear(folder(context));
    }

    private static File folder(Context context) {
        return new File(context.getCacheDir(), FOLDER);
    }

    private static void clear(File folder) {
        File[] files = folder.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.isFile()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }
}
