package de.eimir.app;

import android.app.Activity;
import android.content.Intent;
import androidx.test.runner.AndroidJUnitRunner;

/** Substitute an observing Activity only for explicitly marked native fixture launches. */
public final class PushFixtureRunner extends AndroidJUnitRunner {
    @Override
    public Activity newActivity(ClassLoader loader, String className, Intent intent)
            throws InstantiationException, IllegalAccessException, ClassNotFoundException {
        if (LauncherActivity.class.getName().equals(className)
                && intent.getBooleanExtra(RecordingLauncherActivity.RECORD_DISPATCH, false)) {
            return super.newActivity(RecordingLauncherActivity.class.getClassLoader(),
                RecordingLauncherActivity.class.getName(), intent);
        }
        return super.newActivity(loader, className, intent);
    }
}
