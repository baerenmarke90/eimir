import { beforeEach } from 'vitest';
import { i18n } from './i18n';

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
