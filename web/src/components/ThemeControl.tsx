import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import {
  applyResolvedTheme,
  DARK_MODE_QUERY,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  THEME_PREFERENCE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../theme';

function applyCurrentTheme(systemPrefersDark: boolean): ThemePreference {
  const preference = readThemePreference();
  applyResolvedTheme(resolveTheme(preference, systemPrefersDark), preference);
  return preference;
}

function ThemeRuntime() {
  useEffect(() => {
    const media = window.matchMedia(DARK_MODE_QUERY);
    const syncTheme = () => applyCurrentTheme(media.matches);
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) syncTheme();
    };

    syncTheme();
    media.addEventListener('change', syncTheme);
    window.addEventListener(THEME_PREFERENCE_EVENT, syncTheme);
    window.addEventListener('storage', syncStoredTheme);
    return () => {
      media.removeEventListener('change', syncTheme);
      window.removeEventListener(THEME_PREFERENCE_EVENT, syncTheme);
      window.removeEventListener('storage', syncStoredTheme);
    };
  }, []);

  return null;
}

function ThemePreferenceSelector() {
  const { t } = useTranslation();
  const [preference, setPreference] =
    useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    const media = window.matchMedia(DARK_MODE_QUERY);
    const syncTheme = () =>
      applyResolvedTheme(resolveTheme(preference, media.matches), preference);

    syncTheme();
    if (preference === 'system') media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, [preference]);

  useEffect(() => {
    const syncPreference = (event: Event) => {
      if (event instanceof StorageEvent) {
        if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
        setPreference(readThemePreference());
        return;
      }
      const detail = (event as CustomEvent<ThemePreference>).detail;
      setPreference(detail ?? readThemePreference());
    };

    window.addEventListener(THEME_PREFERENCE_EVENT, syncPreference);
    window.addEventListener('storage', syncPreference);
    return () => {
      window.removeEventListener(THEME_PREFERENCE_EVENT, syncPreference);
      window.removeEventListener('storage', syncPreference);
    };
  }, []);

  function changePreference(next: ThemePreference) {
    storeThemePreference(next);
    setPreference(next);
  }

  return (
    <div className="theme-control theme-control-inline">
      <span className="theme-control-icon" aria-hidden="true">
        ◐
      </span>
      <label htmlFor="theme-preference">{t('theme.label')}</label>
      <select
        id="theme-preference"
        aria-label={t('theme.label')}
        value={preference}
        onChange={(event) =>
          changePreference(event.currentTarget.value as ThemePreference)
        }
      >
        <option value="system">{t('theme.system')}</option>
        <option value="light">{t('theme.light')}</option>
        <option value="dark">{t('theme.dark')}</option>
      </select>
    </div>
  );
}

/**
 * Keeps the effective theme synchronized everywhere while exposing the actual
 * preference control only where the profile settings hierarchy requests it.
 */
export function ThemeControl({
  variant = 'runtime',
}: {
  variant?: 'runtime' | 'inline';
}) {
  return variant === 'runtime' ? <ThemeRuntime /> : <ThemePreferenceSelector />;
}
