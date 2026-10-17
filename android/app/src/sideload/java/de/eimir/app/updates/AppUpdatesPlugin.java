package de.eimir.app.updates;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import de.eimir.app.BuildConfig;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipFile;

/** Sideload-only capability. Product state and authentication remain in React. */
@CapacitorPlugin(name = "EimirAppUpdates")
public final class AppUpdatesPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean active = new AtomicBoolean();
    private final AtomicBoolean destroyed = new AtomicBoolean();
    private final UpdateTransport transport = new UpdateTransport();
    private final Object lock = new Object();
    private long revision;
    private String phase = "idle", errorCode;
    private int progress;
    private UpdateCatalog.Offer offer;
    private File directory, partial, ready;

    @Override public void load() {
        directory = new File(getContext().getCacheDir(), "app-updates");
        if (!directory.isDirectory()) directory.mkdirs();
        partial = new File(directory, "download.part");
        ready = new File(directory, "verified.apk");
        // A prior process's file is never trusted as an implicit install offer.
        partial.delete();
        ready.delete();
    }

    @PluginMethod public void getState(PluginCall call) { call.resolve(snapshot()); }

    @PluginMethod public void checkIfDue(PluginCall call) {
        long now = System.currentTimeMillis();
        long last = getContext().getSharedPreferences("eimir_app_updates", 0)
            .getLong("last_attempt", 0);
        if (now >= last && now - last < 6 * 60 * 60_000L) {
            call.resolve(snapshot());
            return;
        }
        check(call);
    }

    @PluginMethod public void check(PluginCall call) {
        if (!admit(call)) return;
        getContext().getSharedPreferences("eimir_app_updates", 0).edit()
            .putLong("last_attempt", System.currentTimeMillis()).apply();
        setPhase("checking", null);
        worker.execute(() -> {
            try {
                UpdateCatalog.Offer candidate = UpdateCatalog.discover(transport,
                    getContext().getPackageName(), Build.VERSION.SDK_INT);
                transport.ensureActive();
                synchronized (lock) { offer = candidate; progress = 0; }
                ready.delete();
                setPhase(candidate == null ? "noRelease"
                    : candidate.versionCode > BuildConfig.VERSION_CODE ? "available" : "current", null);
            } catch (Exception error) { fail(error); }
            finally { finish(call); }
        });
    }

    @PluginMethod public void download(PluginCall call) {
        if (!admit(call)) return;
        UpdateCatalog.Offer selected;
        synchronized (lock) { selected = offer; }
        if (selected == null || selected.versionCode <= BuildConfig.VERSION_CODE) {
            setPhase("error", "INVALID_RELEASE");
            finish(call);
            return;
        }
        setPhase("downloading", null);
        worker.execute(() -> {
            boolean completed = false;
            try {
                ready.delete();
                transport.download(selected.url, partial, selected.size, selected.sha256, bytes -> {
                    synchronized (lock) { progress = (int) (bytes * 100 / selected.size); }
                    publish();
                });
                validateApk(partial, selected);
                transport.ensureActive();
                if (!partial.renameTo(ready)) throw new IOException("INTEGRITY");
                completed = true;
                setPhase("ready", null);
            } catch (Exception error) { fail(error); }
            finally {
                partial.delete();
                if (!completed) ready.delete();
                finish(call);
            }
        });
    }

    @PluginMethod public void cancel(PluginCall call) {
        transport.cancel();
        // The worker owns its final state/file cleanup; do not release its lock early.
        call.resolve(snapshot());
    }

    @PluginMethod public void install(PluginCall call) {
        if (!admit(call)) return;
        UpdateCatalog.Offer selected;
        synchronized (lock) {
            if (!phase.equals("ready") && !phase.equals("permissionRequired")) {
                finish(call);
                return;
            }
            selected = offer;
        }
        if (selected == null || !ready.isFile()) {
            setPhase("error", "INTEGRITY");
            finish(call);
            return;
        }
        setPhase("verifying", null);
        worker.execute(() -> {
            try {
                // Revalidate the actual private file on each explicit install attempt.
                validateApk(ready, selected);
                transport.ensureActive();
                getActivity().runOnUiThread(() -> {
                    if (destroyed.get()) { active.set(false); return; }
                    try {
                        transport.ensureActive();
                        if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                            setPhase("permissionRequired", null);
                            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getContext().getPackageName())));
                        } else {
                            Uri uri = FileProvider.getUriForFile(getContext(),
                                getContext().getPackageName() + ".appupdates", ready);
                            Intent intent = new Intent(Intent.ACTION_VIEW)
                                .setDataAndType(uri, "application/vnd.android.package-archive")
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            setPhase("installerOpened", null);
                            getActivity().startActivity(intent);
                        }
                    } catch (Exception error) {
                        if (error instanceof CancellationException) fail(error);
                        else setPhase("error", "INSTALL_FAILED");
                    }
                    finally { finish(call); }
                });
            } catch (Exception error) { fail(error); finish(call); }
        });
    }

    @Override protected void handleOnResume() {
        super.handleOnResume();
        synchronized (lock) {
            // Returning from permission settings never starts an installation.
            if (phase.equals("installerOpened")) phase = "ready";
        }
        publish();
    }

    @Override protected void handleOnDestroy() {
        destroyed.set(true);
        transport.cancel();
        worker.shutdownNow();
        super.handleOnDestroy();
    }

    private boolean admit(PluginCall call) {
        if (destroyed.get() || !active.compareAndSet(false, true)) {
            call.resolve(snapshot());
            return false;
        }
        transport.reset();
        return true;
    }

    private void finish(PluginCall call) {
        active.set(false);
        publish();
        if (!destroyed.get()) call.resolve(snapshot());
    }

    private void fail(Exception error) {
        if (error instanceof CancellationException || transport.isCancelled()) setPhase("cancelled", null);
        else {
            String code = error.getMessage();
            setPhase("error", java.util.Arrays.asList("INVALID_RELEASE", "INTEGRITY", "INCOMPATIBLE")
                .contains(code == null ? "" : code) ? code : "NETWORK");
        }
    }

    private void setPhase(String value, String code) {
        synchronized (lock) { phase = value; errorCode = code; }
        publish();
    }

    private void publish() {
        if (!destroyed.get()) notifyListeners("stateChanged", snapshot());
    }

    private JSObject snapshot() {
        synchronized (lock) {
            JSObject state = new JSObject();
            state.put("revision", ++revision);
            state.put("phase", phase);
            state.put("busy", active.get());
            state.put("versionName", BuildConfig.VERSION_NAME);
            state.put("versionCode", BuildConfig.VERSION_CODE);
            state.put("sourceRevision", BuildConfig.EIMIR_SOURCE_REVISION);
            state.put("progress", progress);
            state.put("errorCode", errorCode);
            if (offer != null && offer.versionCode > BuildConfig.VERSION_CODE) {
                JSObject available = new JSObject();
                available.put("versionName", offer.versionName);
                available.put("versionCode", offer.versionCode);
                available.put("releaseNotes", offer.releaseNotes);
                state.put("available", available);
            }
            return state;
        }
    }

    @SuppressWarnings("deprecation")
    private void validateApk(File file, UpdateCatalog.Offer selected) throws Exception {
        if (file.length() != selected.size) throw new IOException("INTEGRITY");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[64 * 1024];
            int count;
            while ((count = input.read(bytes)) != -1) {
                transport.ensureActive();
                digest.update(bytes, 0, count);
            }
        }
        if (!UpdatePolicy.validDigest(digest.digest(), selected.sha256)) throw new IOException("INTEGRITY");
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo apk = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        if (apk == null || apk.applicationInfo == null
            || !installed.packageName.equals(apk.packageName)
            || !selected.versionName.equals(apk.versionName)
            || code(apk) != selected.versionCode || code(apk) <= code(installed)
            || apk.applicationInfo.minSdkVersion != selected.minSdk
            || selected.minSdk > Build.VERSION.SDK_INT
            || !UpdatePolicy.sameSigners(signers(installed), signers(apk))) throw new IOException("INCOMPATIBLE");
        Set<String> abis = new HashSet<>();
        try (ZipFile archive = new ZipFile(file)) {
            var entries = archive.entries();
            while (entries.hasMoreElements()) {
                String name = entries.nextElement().getName();
                if (name.matches("lib/[^/]+/[^/]+\\.so")) abis.add(name.split("/")[1]);
            }
        }
        if (!abis.isEmpty() && java.util.Arrays.stream(Build.SUPPORTED_ABIS).noneMatch(abis::contains)) {
            throw new IOException("INCOMPATIBLE");
        }
    }

    @SuppressWarnings("deprecation")
    private static long code(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static byte[][] signers(PackageInfo info) {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
            ? info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()
            : info.signatures;
        if (signatures == null) return null;
        byte[][] result = new byte[signatures.length][];
        for (int i = 0; i < signatures.length; i++) result[i] = signatures[i].toByteArray();
        return result;
    }
}
