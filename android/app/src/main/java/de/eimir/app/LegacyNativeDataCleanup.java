package de.eimir.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.io.File;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

/**
 * One-way privacy cleanup for storage owned by the retired Kotlin/Compose client.
 *
 * <p>The Capacitor wrapper never reads or migrates these values. Existing installations keep the
 * same application ID, so Android preserves the old app sandbox during an in-place update. Cleanup
 * therefore runs on every start until the retired Room database, remembered-Space preference, and
 * owner-only cache key are gone.
 */
final class LegacyNativeDataCleanup {
    private static final String TAG = "eimir.LegacyCleanup";
    static final String LEGACY_DATABASE = "sidebyside-read-cache.db";
    static final String LEGACY_SPACE_PREFERENCES = "space_preferences";
    static final String LEGACY_KEY_ALIAS = "sidebyside_owner_only_read_cache";

    private LegacyNativeDataCleanup() {}

    static void run(Context context) {
        Context appContext = context.getApplicationContext();
        boolean databaseRemoved = removeLegacyDatabase(appContext);
        boolean preferencesRemoved = clearLegacyPreferences(appContext);
        boolean keyRemoved = removeLegacyKeystoreKey();

        if (!databaseRemoved || !preferencesRemoved || !keyRemoved) {
            Log.w(TAG, "Retired native cache cleanup will retry on the next app start.");
        }
    }

    private static boolean removeLegacyDatabase(Context context) {
        try {
            File database = context.getDatabasePath(LEGACY_DATABASE);
            boolean removed = true;
            if (database.exists() && !context.deleteDatabase(LEGACY_DATABASE)) {
                removed = false;
            }

            for (String suffix : new String[] {"-journal", "-shm", "-wal"}) {
                File sidecar = new File(database.getPath() + suffix);
                if (sidecar.exists() && !sidecar.delete()) {
                    removed = false;
                }
            }

            return removed
                    && !database.exists()
                    && !new File(database.getPath() + "-journal").exists()
                    && !new File(database.getPath() + "-shm").exists()
                    && !new File(database.getPath() + "-wal").exists();
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not remove the retired native read cache.", error);
            return false;
        }
    }

    private static boolean clearLegacyPreferences(Context context) {
        try {
            SharedPreferences preferences =
                    context.getSharedPreferences(LEGACY_SPACE_PREFERENCES, Context.MODE_PRIVATE);
            boolean cleared = preferences.edit().clear().commit();
            if (cleared) {
                context.deleteSharedPreferences(LEGACY_SPACE_PREFERENCES);
            }
            return cleared;
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not clear the retired native Space preference.", error);
            return false;
        }
    }

    private static boolean removeLegacyKeystoreKey() {
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(LEGACY_KEY_ALIAS)) {
                keyStore.deleteEntry(LEGACY_KEY_ALIAS);
            }
            return !keyStore.containsAlias(LEGACY_KEY_ALIAS);
        } catch (GeneralSecurityException | IOException error) {
            Log.w(TAG, "Could not remove the retired native cache key.", error);
            return false;
        }
    }
}
