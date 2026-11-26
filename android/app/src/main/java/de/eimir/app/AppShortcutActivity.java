package de.eimir.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** Static shortcuts clear their task. An affinity-free entry protects the live WebView. */
public final class AppShortcutActivity extends Activity {
    static Intent destination(Context context, Intent incoming) {
        if (incoming == null || !"de.eimir.app.APP_SHORTCUT".equals(incoming.getAction())) return null;
        String action = incoming.getStringExtra("shortcutAction");
        if (!AppShortcutDelivery.supports(action)) return null;
        // Never forward the launcher's CLEAR_TASK flag or arbitrary extras.
        return new Intent(context, LauncherActivity.class)
            .setAction("de.eimir.app.APP_SHORTCUT").putExtra("shortcutAction", action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            Intent destination = destination(this, getIntent());
            if (destination != null) startActivity(destination);
        } finally { finish(); }
    }
}
