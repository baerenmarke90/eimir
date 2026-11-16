// Generated from the bundled locale registry. Run npm run i18n:generate.
// ES5 only: this page must run on WebViews below the supported floor.
(function () {
  var floor = 111;
  var messages = {
    de: {
      outdatedTitle: 'Ein Update von „Android System WebView“ fehlt.',
      outdatedBody:
        'Diese Systemkomponente zeigt eimir. auf deinem Gerät an. Aktualisiere sie im Play Store, auf älteren Geräten auch „Google Chrome“. Gespeicherte Inhalte bleiben erhalten.',
      outdatedAction: 'Im Play Store öffnen',
      loadTitle: 'Die App konnte nicht geladen werden.',
      loadBody:
        'Versuche es bitte noch einmal. Gespeicherte Inhalte bleiben erhalten.',
      retry: 'Erneut versuchen',
      direction: 'ltr',
    },
    en: {
      outdatedTitle: 'An Android System WebView update is needed.',
      outdatedBody:
        'This system component displays eimir. on your device. Update it in the Play Store, and on older devices Google Chrome as well. Your saved content is kept.',
      outdatedAction: 'Open Play Store',
      loadTitle: 'The app could not load.',
      loadBody: 'Please try again. Your saved content is kept.',
      retry: 'Try again',
      direction: 'ltr',
    },
  };
  var explicit = null;
  var stored,
    account,
    tokens,
    candidates,
    locale,
    index,
    version,
    outdated,
    copy,
    store,
    retry;
  function resolve(value) {
    var tag = String(value || '')
      .replace(/^\s+|\s+$/g, '')
      .toLowerCase()
      .split('_')
      .join('-');
    var key, cut;
    while (tag) {
      for (key in messages) {
        if (
          Object.prototype.hasOwnProperty.call(messages, key) &&
          key.toLowerCase() === tag
        )
          return key;
      }
      cut = tag.lastIndexOf('-');
      tag = cut < 0 ? '' : tag.slice(0, cut);
    }
    return null;
  }
  try {
    stored = JSON.parse(
      window.sessionStorage.getItem('eimir-session-v1') || 'null'
    );
    account = stored && stored.account;
    tokens = stored && stored.tokens;
    if (
      account &&
      account.id &&
      tokens &&
      tokens.refreshToken &&
      new Date(tokens.refreshExpiresAt).getTime() > Date.now() &&
      account.languagePreference &&
      account.languagePreference !== 'auto'
    )
      explicit = resolve(account.languagePreference) || 'de';
  } catch (_error) {}
  candidates =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  locale = explicit;
  for (index = 0; !locale && index < candidates.length; index += 1)
    locale = resolve(candidates[index]);
  locale = locale || 'de';
  version = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
  outdated = Boolean(version) && Number(version[1]) < floor;
  copy = messages[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = copy.direction;
  document.documentElement.setAttribute(
    'data-webview-notice',
    outdated ? 'outdated' : 'load-failed'
  );
  document.querySelector('h1').textContent = outdated
    ? copy.outdatedTitle
    : copy.loadTitle;
  document.querySelector('[data-notice-description]').textContent = outdated
    ? copy.outdatedBody
    : copy.loadBody;
  store = document.querySelector('[data-notice-store]');
  retry = document.querySelector('[data-notice-retry]');
  store.textContent = copy.outdatedAction;
  retry.textContent = copy.retry;
  store.hidden = !outdated;
  retry.hidden = outdated;
})();
