package de.eimir.app;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded no-backup receipt metadata, never notification text or an unread ledger. */
final class PushReceipts {
    private static final int LIMIT = 256;
    private static final long WINDOW_SECONDS = 600;

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "eimir-push-receipts"));
    }

    // Called under PushActivation's monitor, including the following OS post.
    static boolean claim(Context context, PushActivation activation, String notificationId) {
        AtomicFile snapshot = file(context);
        FileOutputStream output = null;
        try {
            JSONObject state;
            try {
                if (snapshot.getBaseFile().length() > 32768) state = new JSONObject();
                else state = new JSONObject(new String(snapshot.readFully(), StandardCharsets.UTF_8));
            } catch (FileNotFoundException | org.json.JSONException absentOrDamaged) {
                state = new JSONObject();
            }
            long now = System.currentTimeMillis() / 1000;
            JSONArray previous = activation.activationId.equals(state.optString("activationId"))
                ? state.optJSONArray("receipts") : null;
            JSONArray retained = new JSONArray();
            retained.put(new JSONObject().put("id", notificationId).put("until", now + WINDOW_SECONDS));
            if (previous != null) {
                for (int i = 0; i < previous.length() && i < LIMIT; i++) {
                    JSONObject receipt = previous.optJSONObject(i);
                    if (receipt == null) continue;
                    long until = receipt.optLong("until", 0);
                    if (until <= now || until > now + WINDOW_SECONDS) continue;
                    if (notificationId.equals(receipt.optString("id"))) return false;
                    if (retained.length() < LIMIT) retained.put(receipt);
                }
            }
            byte[] bytes = new JSONObject().put("activationId", activation.activationId)
                .put("receipts", retained).toString().getBytes(StandardCharsets.UTF_8);
            output = snapshot.startWrite();
            output.write(bytes);
            snapshot.finishWrite(output);
            return true;
        } catch (Exception unavailable) {
            if (output != null) snapshot.failWrite(output);
            return false;
        }
    }

    static void clear(Context context) {
        AtomicFile snapshot = file(context);
        snapshot.delete();
        if (snapshot.getBaseFile().exists()) throw new IllegalStateException("PUSH_STORAGE_UNAVAILABLE");
    }
}
