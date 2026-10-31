package de.eimir.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens the system editor; calendar storage remains owned by the selected app. */
@CapacitorPlugin(name = "PlanCalendar")
public class PlanCalendarPlugin extends Plugin {
    @PluginMethod
    public void openEvent(PluginCall call) {
        final Intent intent;
        try {
            intent = PlanCalendarIntent.create(call.getData());
        } catch (IllegalArgumentException invalid) {
            call.reject("Invalid calendar event", "INVALID_CALENDAR_EVENT");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                // Do not preflight resolveActivity: package visibility can hide handlers.
                getActivity().startActivity(intent);
                // ACTION_INSERT does not reliably report whether the user saved.
                call.resolve();
            } catch (ActivityNotFoundException unavailable) {
                call.reject("No calendar app is available", "NO_CALENDAR_APP");
            } catch (RuntimeException unavailable) {
                call.reject("Calendar editor could not be opened", "CALENDAR_UNAVAILABLE");
            }
        });
    }
}
