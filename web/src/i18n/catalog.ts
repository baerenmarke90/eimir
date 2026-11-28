/**
 * The lightweight locale catalog: names, text direction and an on-demand loader
 * per language. The translation packs themselves are never imported statically
 * here, so the entry bundle carries no locale resources (docs/CROSS-CUTTING-QUALITY.md,
 * performance). Add a language by adding one entry and its pack; feature
 * components never branch on languages.
 */
export interface LocaleCatalogEntry {
  name: string;
  direction: 'ltr' | 'rtl';
  /** Resolves the complete translation tree for this language. */
  load: () => Promise<Record<string, unknown>>;
}

export const localeCatalog = {
  de: {
    name: 'Deutsch',
    direction: 'ltr',
    load: async () => (await import('./germanPack')).germanResources,
  },
  en: {
    name: 'English',
    direction: 'ltr',
    load: async () => (await import('./locales/en.json')).default,
  },
} as const satisfies Record<string, LocaleCatalogEntry>;

export type SupportedLocale = keyof typeof localeCatalog;
export const supportedLocales = Object.keys(localeCatalog) as SupportedLocale[];
