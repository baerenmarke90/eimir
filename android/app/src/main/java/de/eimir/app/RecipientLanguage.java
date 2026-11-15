package de.eimir.app;

import android.content.Context;
import android.content.res.Configuration;
import java.util.Locale;

/** Recipient presentation metadata never changes navigation or authorization. */
public final class RecipientLanguage {
    private RecipientLanguage() {}

    public static Context context(Context context, String tag) {
        String candidate = tag != null && tag.length() <= 35
            && tag.matches("[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*") ? tag : "de";
        Locale language = Locale.forLanguageTag(candidate);
        Context localized = withLocale(context, language);
        // A pack declares its own marker. Library resources must not make an
        // untranslated language look supported; unsupported tags use German.
        String pack = localized.getString(R.string.product_locale).toLowerCase(Locale.ROOT);
        String requested = language.toLanguageTag().toLowerCase(Locale.ROOT);
        if (!requested.equals(pack) && !requested.startsWith(pack + "-"))
            localized = withLocale(context, Locale.GERMAN);
        return localized;
    }

    private static Context withLocale(Context context, Locale locale) {
        Configuration configuration = new Configuration(context.getResources().getConfiguration());
        configuration.setLocale(locale);
        return context.createConfigurationContext(configuration);
    }
}
