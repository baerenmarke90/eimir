package de.eimir.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;

/** Exercise Android's installed manifest matching, not an XML string assertion. */
public final class IdentityAppLinksTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private ResolveInfo resolve(String url) {
        Intent link = new Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(context.getPackageName());
        return context.getPackageManager().resolveActivity(link, 0);
    }

    /** The canonical host and the transition host that remains until installed builds have moved (#1835). */
    private static final String[] CLAIMED_HOSTS = {"app.eimir.de", "demo.eimir.ur-cloud.de"};

    @Test public void allCanonicalMailboxLinksReachTheRegularLauncher() {
        for (String host : CLAIMED_HOSTS) {
            for (String path : new String[] {"signup", "magic-link", "invitation", "verify-email", "recovery"}) {
                ResolveInfo activity = resolve("https://" + host + "/auth/" + path + "?token=synthetic-proof");
                assertNotNull(host + " " + path, activity);
                assertEquals(host + " " + path, "de.eimir.app.LauncherActivity", activity.activityInfo.name);
            }
        }
    }

    @Test public void unrelatedAndForeignUrlsAreNotClaimed() {
        for (String url : new String[] {
            "http://demo.eimir.ur-cloud.de/auth/magic-link?token=synthetic-proof",
            "http://app.eimir.de/auth/magic-link?token=synthetic-proof",
            "https://demo.eimir.ur-cloud.de.evil.example/auth/magic-link?token=synthetic-proof",
            "https://app.eimir.de.evil.example/auth/magic-link?token=synthetic-proof",
            "https://eimir.de/auth/magic-link?token=synthetic-proof",
            "https://other.example/auth/magic-link?token=synthetic-proof",
            "https://demo.eimir.ur-cloud.de/",
            "https://app.eimir.de/",
            "https://demo.eimir.ur-cloud.de/auth/magic-link/extra?token=synthetic-proof",
            "https://app.eimir.de/auth/magic-link/extra?token=synthetic-proof",
            "https://demo.eimir.ur-cloud.de/api/v1/auth/magic-link/consume",
            "https://app.eimir.de/api/v1/auth/magic-link/consume"
        }) assertNull(url, resolve(url));
    }
}
