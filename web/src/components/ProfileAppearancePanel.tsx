import { useTranslation } from '../i18n';
import { AppIconSettingsPanel } from './AppIconSettingsPanel';
import { LanguageSettings } from './LanguageSettings';
import { ThemeControl } from './ThemeControl';
import { WirDesignSettings } from './WirDesignSettings';

/** Appearance belongs to the centralized personal settings hierarchy. */
export function ProfileAppearancePanel({
  id = 'settings-appearance',
  language,
}: {
  id?: string;
  language?: { apiBaseUrl: string; accessToken: string; accountId: string };
} = {}) {
  const { t } = useTranslation();

  return (
    <div id={id} className="settings-category-content">
      <section
        className="settings-section"
        aria-labelledby="profile-appearance-title"
      >
        <h2 id="profile-appearance-title">{t('appIcon.colorMode')}</h2>
        <ThemeControl variant="inline" />
      </section>
      {language ? (
        <LanguageSettings
          key={`${language.apiBaseUrl}:${language.accountId}`}
          {...language}
        />
      ) : null}
      <WirDesignSettings />
      <AppIconSettingsPanel />
    </div>
  );
}
