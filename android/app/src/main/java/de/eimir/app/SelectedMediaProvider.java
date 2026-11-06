package de.eimir.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Binder;
import android.os.ParcelFileDescriptor;
import android.os.Process;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.Closeable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Read-only, process-local descriptor leases for explicitly selected videos. */
public final class SelectedMediaProvider extends ContentProvider {
    private static final int MAX_LEASES = 1000;
    private static final Map<String, Lease> leases = new HashMap<>();

    private static final class Lease {
        final AssetFileDescriptor source;
        final String name;
        final String type;
        final long size;
        final long offset;

        Lease(AssetFileDescriptor source, String name, String type) {
            this.source = source;
            this.name = name;
            this.type = type;
            this.size = source.getLength();
            this.offset = source.getStartOffset();
        }
    }

    /** The existing chooser owns both pending results and completed File inputs. */
    static final class Owner implements AutoCloseable {
        private final Set<String> tokens = new HashSet<>();
        private boolean closed;

        Uri adopt(Context context, Uri selected) { return adopt(context, selected, false); }

        Uri adoptAudio(Context context, Uri selected) { return adopt(context, selected, true); }

        private Uri adopt(Context context, Uri selected, boolean audio) {
            AssetFileDescriptor source = null;
            try {
                synchronized (leases) { if (closed) return selected; }
                String type = context.getContentResolver().getType(selected);
                if (audio) {
                    if (type == null || !type.startsWith("audio/")) return selected;
                } else if (!"video/mp4".equals(type) && !"video/quicktime".equals(type)) return selected;
                String name = "video" + ("video/mp4".equals(type) ? ".mp4" : ".mov");
                if (!audio) try (Cursor cursor = context.getContentResolver().query(selected,
                        new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
                }
                source = context.getContentResolver().openAssetFileDescriptor(selected, "r");
                if (source == null) return selected;
                if (audio && source.getLength() > 20L * 1024 * 1024) return selected;
                Lease lease = new Lease(source, audio ? "voice" : name, type);
                synchronized (leases) {
                    if (closed || leases.size() >= MAX_LEASES) return selected;
                    String token = UUID.randomUUID().toString();
                    leases.put(token, lease);
                    tokens.add(token);
                    source = null; // Ownership moves only after complete registration.
                    return new Uri.Builder().scheme("content")
                        .authority(context.getPackageName() + ".selectedmedia").appendPath(token).build();
                }
            } catch (IOException | RuntimeException unavailable) {
                // Existing Web validation/error handling owns unreadable or unsupported inputs.
                return selected;
            } finally {
                closeDescriptor(source);
            }
        }

        @Override
        public void close() {
            List<Lease> released = new ArrayList<>();
            synchronized (leases) {
                closed = true;
                for (String token : tokens) {
                    Lease lease = leases.remove(token);
                    if (lease != null) released.add(lease);
                }
                tokens.clear();
            }
            for (Lease lease : released) closeDescriptor(lease.source);
        }
    }

    private static void closeDescriptor(Closeable descriptor) {
        if (descriptor == null) return;
        try { descriptor.close(); }
        catch (IOException unavailable) { /* The lease is already invalidated. */ }
    }

    private Lease lease(Uri uri) throws FileNotFoundException {
        if (Binder.getCallingUid() != Process.myUid()) throw new SecurityException("Private selected media");
        if (!"content".equals(uri.getScheme())
                || !(getContext().getPackageName() + ".selectedmedia").equals(uri.getAuthority())
                || uri.getPathSegments().size() != 1 || uri.getQuery() != null || uri.getFragment() != null) {
            throw new FileNotFoundException("Selected media unavailable");
        }
        Lease lease = leases.get(uri.getLastPathSegment());
        if (lease == null) throw new FileNotFoundException("Selected media unavailable");
        return lease;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public String getType(Uri uri) {
        synchronized (leases) {
            try { return lease(uri).type; }
            catch (FileNotFoundException unavailable) { return null; }
        }
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] arguments, String order) {
        synchronized (leases) {
            try {
                Lease lease = lease(uri);
                String[] columns = projection != null ? projection
                    : new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
                MatrixCursor cursor = new MatrixCursor(columns, 1);
                Object[] values = new Object[columns.length];
                for (int i = 0; i < columns.length; i++) {
                    if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = lease.name;
                    else if (OpenableColumns.SIZE.equals(columns[i])) values[i] = lease.size;
                    else if ("last_modified".equals(columns[i])) values[i] = 0L;
                }
                cursor.addRow(values);
                return cursor;
            } catch (FileNotFoundException unavailable) {
                return null;
            }
        }
    }

    @Override
    public AssetFileDescriptor openAssetFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Selected media is read only");
        Lease lease;
        ParcelFileDescriptor anchor;
        synchronized (leases) {
            lease = lease(uri);
            try {
                anchor = ParcelFileDescriptor.dup(lease.source.getFileDescriptor());
            } catch (IOException unavailable) {
                throw new FileNotFoundException("Selected media unavailable");
            }
        }
        ParcelFileDescriptor reader = null;
        try {
            // Reopen the same granted file with an independent cursor. Provider
            // work must never hold the registry lock needed by Activity disposal.
            reader = ParcelFileDescriptor.open(new File("/proc/self/fd/" + anchor.getFd()),
                ParcelFileDescriptor.MODE_READ_ONLY);
            synchronized (leases) {
                if (leases.get(uri.getLastPathSegment()) != lease)
                    throw new FileNotFoundException("Selected media unavailable");
            }
            AssetFileDescriptor result = new AssetFileDescriptor(reader, lease.offset, lease.size);
            reader = null;
            return result;
        } catch (IOException unavailable) {
            throw new FileNotFoundException("Selected media unavailable");
        } finally {
            closeDescriptor(reader);
            closeDescriptor(anchor);
        }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        AssetFileDescriptor descriptor = openAssetFile(uri, mode);
        if (descriptor.getStartOffset() == 0) return descriptor.getParcelFileDescriptor();
        closeDescriptor(descriptor);
        throw new FileNotFoundException("Selected media requires its asset range");
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] arguments) {
        throw new UnsupportedOperationException();
    }
    @Override public int delete(Uri uri, String selection, String[] arguments) {
        throw new UnsupportedOperationException();
    }
}
