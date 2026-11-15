package de.eimir.app;

import android.content.Intent;
import android.os.Bundle;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

/** A renderer-independent escape hatch. Restart is always an explicit action. */
public final class RuntimeRecoveryActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        new AlertDialog.Builder(this)
            .setTitle(R.string.runtime_recovery_title)
            .setMessage(R.string.runtime_recovery_message)
            .setPositiveButton(R.string.runtime_recovery_retry, (dialog, which) -> {
                startActivity(new Intent(this, LauncherActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK));
                finish();
            })
            .setNegativeButton(R.string.runtime_recovery_close, (dialog, which) -> finish())
            .setOnCancelListener(dialog -> finish())
            .show();
    }
}
