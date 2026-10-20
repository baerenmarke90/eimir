package de.eimir.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.PendingIntent;
import android.os.Build;
import android.app.Activity;
import android.os.Bundle;

/** A local protocol observer, installed only in the instrumentation APK. */
public final class TestPushDistributor extends BroadcastReceiver {
    public static final String OBSERVED = "de.eimir.app.test.PUSH_DISTRIBUTOR_REQUEST";

    /** Leave Android's initial stopped state before receiving connector broadcasts. */
    public static final class ActivationActivity extends Activity {
        @Override
        public void onCreate(Bundle state) {
            super.onCreate(state);
            sendBroadcast(new Intent(OBSERVED).setPackage(getIntent().getStringExtra("targetApplication"))
                .putExtra("operation", "activated"));
            finish();
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        PendingIntent caller = intent.getParcelableExtra("pi");
        String application = Build.VERSION.SDK_INT >= 34 ? getSentFromPackage() : null;
        if (application == null && caller != null) application = caller.getCreatorPackage();
        if (application == null) return;
        context.sendBroadcast(new Intent(OBSERVED).setPackage(application)
            .putExtra("operation", intent.getAction()).putExtra("token", intent.getStringExtra("token")));
    }
}
