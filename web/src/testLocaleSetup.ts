import { beforeEach } from 'vitest';
import { i18n, i18nReady } from './i18n';
import { supportedLocales } from './i18n/catalog';

// Locale packs load on demand; wait for the first one before anything renders.
await i18nReady;
// Fixtures also address other languages per call (getFixedT, lng); the on-demand
// loading itself is covered by src/i18n/i18n.test.ts and the browser specs.
await i18n.loadLanguages(supportedLocales);

// Apply the fixture locale before test modules build parameterized copy, too.
await i18n.changeLanguage('de');

// Existing product fixtures intentionally exercise German copy. Multilingual
// cases select their own language/device list explicitly inside the test.
beforeEach(async () => {
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['de-DE'],
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'de-DE',
    });
  }
  await i18n.changeLanguage('de');
});
