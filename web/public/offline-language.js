// Generated from the bundled locale registry. Run npm run i18n:generate.
(() => {
  const messages = {
    de: {
      title: 'Gerade keine Verbindung.',
      body: 'Auf dieser Offline-Seite werden keine privaten Inhalte gespeichert. Sobald die Verbindung wieder da ist, kannst du eimir. normal weiterverwenden.',
      retry: 'Erneut versuchen',
      direction: 'ltr',
    },
    en: {
      title: 'No connection right now.',
      body: 'Your private content is not stored in this offline page. Once your connection is back, you can use eimir. as usual.',
      retry: 'Try again',
      direction: 'ltr',
    },
  };
  const resolve = (value) => {
    let tag = String(value || '')
      .trim()
      .toLowerCase()
      .replaceAll('_', '-');
    while (tag) {
      const supported = Object.keys(messages).find(
        (locale) => locale.toLowerCase() === tag,
      );
      if (supported) return supported;
      tag = tag.slice(0, tag.lastIndexOf('-') < 0 ? 0 : tag.lastIndexOf('-'));
    }
    return null;
  };
  let explicit;
  try {
    const stored = JSON.parse(
      sessionStorage.getItem('eimir-session-v1') || 'null',
    );
    if (
      stored?.account?.id &&
      stored?.tokens?.refreshToken &&
      new Date(stored.tokens.refreshExpiresAt).getTime() > Date.now() &&
      stored.account.languagePreference &&
      stored.account.languagePreference !== 'auto'
    )
      explicit = resolve(stored.account.languagePreference) || 'de';
  } catch {}
  const locale =
    explicit ||
    (navigator.languages?.length ? navigator.languages : [navigator.language])
      .map(resolve)
      .find(Boolean) ||
    'de';
  document.documentElement.lang = locale;
  const copy = messages[locale];
  document.documentElement.dir = copy.direction;
  document.querySelector('h1').textContent = copy.title;
  document.querySelector('[data-offline-description]').textContent = copy.body;
  document.querySelector('main a').textContent = copy.retry;
})();
