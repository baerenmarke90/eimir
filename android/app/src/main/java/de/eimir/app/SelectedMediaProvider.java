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
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Read-only, process-local descriptor leases for explicitly selected videos. */
public final class SelectedMediaProvider extends ContentProvider {
    private static final int MAX_LEASES = 1000;
    /** Largest shared photo that is adopted; larger or unsized streams stay with the sender. */
    static final long MAX_SHARED_IMAGE_BYTES = 25L * 1024 * 1024;
    private static final Set<String> SHARED_IMAGE_TYPES = new HashSet<>(Arrays.asList(
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"));
    private static final Map<String, Lease> leases = new HashMap<>();

    private enum Kind { VIDEO, AUDIO, IMAGE }

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

        Uri adopt(Context context, Uri selected) { return adopt(context, selected, Kind.VIDEO); }

        Uri adoptAudio(Context context, Uri selected) { return adopt(context, selected, Kind.AUDIO); }

        /** A shared photo: bounded, known length, one of the supported still-image types. */
        Uri adoptImage(Context context, Uri selected) { return adopt(context, selected, Kind.IMAGE); }

        private Uri adopt(Context context, Uri selected, Kind kind) {
            AssetFileDescriptor source = null;
            try {
                synchronized (leases) { if (closed) return selected; }
                String type = context.getContentResolver().getType(selected);
                if (kind == Kind.AUDIO) {
                    if (type == null || !type.startsWith("audio/")) return selected;
                } else if (kind == Kind.IMAGE) {
                    type = type == null ? null : type.toLowerCase(Locale.ROOT);
                    if (type == null || !SHARED_IMAGE_TYPES.contains(type)) return selected;
                } else if (!"video/mp4".equals(type) && !"video/quicktime".equals(type)) return selected;
                String name = "video" + ("video/mp4".equals(type) ? ".mp4" : ".mov");
                if (kind == Kind.VIDEO) try (Cursor cursor = context.getContentResolver().query(selected,
                        new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
                }
                source = context.getContentResolver().openAssetFileDescriptor(selected, "r");
                if (source == null) return selected;
                if (kind == Kind.AUDIO && source.getLength() > 20L * 1024 * 1024) return selected;
                // An unknown length cannot be bounded, so a shared photo must declare its size.
                if (kind == Kind.IMAGE && (source.getLength() < 0 || source.getLength() > MAX_SHARED_IMAGE_BYTES))
                    return selected;
                Lease lease = new Lease(source, kind == Kind.AUDIO ? "voice" : kind == Kind.IMAGE ? "image" : name, type);
                synchronized (leases) {
                    if (closed || leases.size() >= MAX_LEASES) return selected;
                    String token = UUID.randomUUID().toString();
                    if (kind == Kind.VIDEO) lease = new Lease(source, "eimir-selected-" + token + ("video/mp4".equals(type) ? ".mp4" : ".mov"), type);
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

    /** Resolve only a File produced by this process's explicit native selection. */
    static AssetFileDescriptor openForTransfer(Context context, String name, String type) throws IOException {
        if (name == null || !name.matches("eimir-selected-[0-9a-f-]{36}\\.(mp4|mov)"))
            throw new FileNotFoundException("Selected video unavailable");
        String token = name.substring("eimir-selected-".length(), name.lastIndexOf('.'));
        synchronized (leases) {
            Lease selected = leases.get(token);
            if (selected == null || !name.equals(selected.name) || !type.equals(selected.type))
                throw new FileNotFoundException("Selected video unavailable");
        }
        Uri uri = new Uri.Builder().scheme("content").authority(context.getPackageName() + ".selectedmedia").appendPath(token).build();
        AssetFileDescriptor source = context.getContentResolver().openAssetFileDescriptor(uri, "r");
        if (source == null) throw new FileNotFoundException("Selected video unavailable");
        return source;
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
