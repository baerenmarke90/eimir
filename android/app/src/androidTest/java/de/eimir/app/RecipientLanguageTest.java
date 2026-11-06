package de.eimir.app;

import static org.junit.Assert.assertEquals;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;

/** Personal recipient language is independent of the device and actor. */
public class RecipientLanguageTest {
    @Test public void englishAndGermanResolveTheirOwnResourcesAndUnknownTagsUseGerman() {
        Context device = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Context english = RecipientLanguage.context(device, "en-US");
        Context german = RecipientLanguage.context(device, "de-CH");
        assertEquals("en", english.getString(R.string.product_locale));
        assertEquals("de", german.getString(R.string.product_locale));
        assertEquals("de", RecipientLanguage.context(device, "zz-ZZ").getString(R.string.product_locale));
        assertEquals("de", RecipientLanguage.context(device, null).getString(R.string.product_locale));
        assertEquals("de", RecipientLanguage.context(device, "en<script>").getString(R.string.product_locale));
    }
}
