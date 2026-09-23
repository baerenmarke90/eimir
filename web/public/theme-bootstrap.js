(function bootstrapTheme() {
  var storageKey = 'eimir.theme';
  var legacyStorageKey = 'sidebyside.theme';
  var darkModeQuery = '(prefers-color-scheme: dark)';
  var themeColors = {
    light: '#e6ebfa',
    dark: '#171b2f',
  };

  var preference = 'system';
  var storedPreference;
  try {
    storedPreference =
      window.localStorage.getItem(storageKey) ||
      window.localStorage.getItem(legacyStorageKey);
    if (
      storedPreference === 'system' ||
      storedPreference === 'light' ||
      storedPreference === 'dark'
    ) {
      preference = storedPreference;
      window.localStorage.setItem(storageKey, preference);
      window.localStorage.removeItem(legacyStorageKey);
    }
  } catch {
    // Storage can be blocked in hardened/private browser contexts. Falling
    // back to the system preference keeps startup deterministic and usable.
  }

  var systemPrefersDark = window.matchMedia(darkModeQuery).matches;
  var theme =
    preference === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : preference;
  var root = document.documentElement;

  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = theme;

  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = themeColors[theme];
  }
  var favicon = document.getElementById?.('app-favicon');
  if (favicon)
    favicon.href = theme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg';
})();
