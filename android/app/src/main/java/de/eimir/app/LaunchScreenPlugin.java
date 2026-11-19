package de.eimir.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the Web shell end the system launch screen once its first real view has painted. */
@CapacitorPlugin(name = "LaunchScreen")
public class LaunchScreenPlugin extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        LaunchScreenHold.release();
        call.resolve();
    }
}
