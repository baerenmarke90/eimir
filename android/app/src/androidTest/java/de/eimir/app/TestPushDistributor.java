package de.eimir.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A discoverable, inert distributor confined to the instrumentation APK. */
public final class TestPushDistributor extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Discovery and dispatch are tested; no provider or delivery is simulated.
    }
}
