export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'eimir.theme';
export const LEGACY_THEME_STORAGE_KEY = 'sidebyside.theme';
export const THEME_PREFERENCE_EVENT = 'eimir:theme-preference';
export const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

let activeThemePreference: ThemePreference | null = null;

export function parseThemePreference(
  value: string | null | undefined,
): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function readThemePreference(): ThemePreference {
  try {
    const canonical = window.localStorage.getItem(THEME_STORAGE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    const preference = parseThemePreference(canonical ?? legacy);
    if (canonical === null && legacy !== null) {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }
    activeThemePreference = preference;
    return preference;
  } catch {
    return activeThemePreference ?? 'system';
  }
}

export function storeThemePreference(preference: ThemePreference): void {
  activeThemePreference = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // active document still changes theme; only persistence is skipped.
  }
  if (
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    window.dispatchEvent(
      new CustomEvent<ThemePreference>(THEME_PREFERENCE_EVENT, {
        detail: preference,
      }),
    );
  }
}

export function applyResolvedTheme(
  theme: ResolvedTheme,
  preference?: ThemePreference,
): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (preference) root.dataset.themePreference = preference;
  root.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  // Resolve the semantic CSS role after switching data-theme so the React
  // runtime does not own a duplicate raw browser-chrome palette.
  const resolvedBackground = window
    .getComputedStyle(root)
    .getPropertyValue('--color-background')
    .trim();
  if (themeColor && resolvedBackground) themeColor.content = resolvedBackground;
  const favicon = document.getElementById?.('app-favicon');
  if (favicon?.tagName === 'LINK') {
    (favicon as HTMLLinkElement).href =
      theme === 'dark' ? '/favicon-dark.svg' : '/favicon.svg';
  }
}

export function initializeTheme(): ThemePreference {
  const preference = readThemePreference();
  const systemPrefersDark = window.matchMedia(DARK_MODE_QUERY).matches;
  applyResolvedTheme(resolveTheme(preference, systemPrefersDark), preference);
  return preference;
}
