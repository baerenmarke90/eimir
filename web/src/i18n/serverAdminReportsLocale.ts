import { i18n } from './index';
import { lazyLocalePack } from './locales/serverAdminReports';

/** Adds the Reports section's copy to every language; repeated calls are harmless. */
export function registerServerAdminReportsLocale(): void {
  for (const [locale, pack] of Object.entries(lazyLocalePack)) {
    i18n.addResourceBundle(locale, 'translation', pack, true, false);
  }
}
