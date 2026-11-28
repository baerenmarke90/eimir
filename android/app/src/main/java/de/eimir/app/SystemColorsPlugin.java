package de.eimir.app;

import android.content.res.Resources;
import android.os.Build;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports the Android 12+ dynamic (Material You) system palette to the Web
 * shell, which maps it onto its action and brand accent tokens when the
 * person chooses "System colours". Tone numbers are the fixed Material tonal
 * steps; the Web picks the tones per light/dark scheme. Older Android
 * versions report the palette as unavailable. The palette is read fresh on
 * every call, so a wallpaper change shows on the next foreground return.
 */
@CapacitorPlugin(name = "SystemColors")
public class SystemColorsPlugin extends Plugin {
    static final int[] TONES = {0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000};

    @PluginMethod
    public void palette(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("available", false);
            call.resolve(result);
            return;
        }
        try {
            Resources resources = getActivity().getResources();
            result.put("available", true);
            result.put("accent1", family(resources, Families.ACCENT1));
            result.put("accent2", family(resources, Families.ACCENT2));
            result.put("neutral1", family(resources, Families.NEUTRAL1));
            result.put("neutral2", family(resources, Families.NEUTRAL2));
        } catch (RuntimeException unavailable) {
            result = new JSObject();
            result.put("available", false);
        }
        call.resolve(result);
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private JSObject family(Resources resources, int[] ids) {
        JSObject tones = new JSObject();
        for (int index = 0; index < TONES.length; index++) {
            int color = resources.getColor(ids[index], getActivity().getTheme());
            tones.put(String.valueOf(TONES[index]), String.format("#%06x", color & 0xFFFFFF));
        }
        return tones;
    }

    /** Resource ids per tone, in the order of {@link #TONES}. */
    @RequiresApi(Build.VERSION_CODES.S)
    private static final class Families {
        static final int[] ACCENT1 = {
            android.R.color.system_accent1_0, android.R.color.system_accent1_10, android.R.color.system_accent1_50, android.R.color.system_accent1_100, android.R.color.system_accent1_200, android.R.color.system_accent1_300, android.R.color.system_accent1_400, android.R.color.system_accent1_500, android.R.color.system_accent1_600, android.R.color.system_accent1_700, android.R.color.system_accent1_800, android.R.color.system_accent1_900, android.R.color.system_accent1_1000
        };
        static final int[] ACCENT2 = {
            android.R.color.system_accent2_0, android.R.color.system_accent2_10, android.R.color.system_accent2_50, android.R.color.system_accent2_100, android.R.color.system_accent2_200, android.R.color.system_accent2_300, android.R.color.system_accent2_400, android.R.color.system_accent2_500, android.R.color.system_accent2_600, android.R.color.system_accent2_700, android.R.color.system_accent2_800, android.R.color.system_accent2_900, android.R.color.system_accent2_1000
        };
        static final int[] NEUTRAL1 = {
            android.R.color.system_neutral1_0, android.R.color.system_neutral1_10, android.R.color.system_neutral1_50, android.R.color.system_neutral1_100, android.R.color.system_neutral1_200, android.R.color.system_neutral1_300, android.R.color.system_neutral1_400, android.R.color.system_neutral1_500, android.R.color.system_neutral1_600, android.R.color.system_neutral1_700, android.R.color.system_neutral1_800, android.R.color.system_neutral1_900, android.R.color.system_neutral1_1000
        };
        static final int[] NEUTRAL2 = {
            android.R.color.system_neutral2_0, android.R.color.system_neutral2_10, android.R.color.system_neutral2_50, android.R.color.system_neutral2_100, android.R.color.system_neutral2_200, android.R.color.system_neutral2_300, android.R.color.system_neutral2_400, android.R.color.system_neutral2_500, android.R.color.system_neutral2_600, android.R.color.system_neutral2_700, android.R.color.system_neutral2_800, android.R.color.system_neutral2_900, android.R.color.system_neutral2_1000
        };
    }
}
