import {
  localeCatalog,
  type SupportedLocale,
  supportedLocales,
} from './catalog';
import { germanResources } from './germanPack';
import en from './locales/en.json';

export { germanResources };

/**
 * Every pack, loaded eagerly. The application never imports this module (it
 * would put all locale resources into the entry bundle); tests and the static
 * locale generator use it as the complete, synchronous registry.
 */
export const localeRegistry = {
  de: { ...localeCatalog.de, translation: germanResources },
  en: { ...localeCatalog.en, translation: en },
} as const;

export type { SupportedLocale };
export { supportedLocales };
export const resources = Object.fromEntries(
  supportedLocales.map((locale) => [
    locale,
    { translation: localeRegistry[locale].translation },
  ]),
);
