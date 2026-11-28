import { useTranslation } from '../i18n';
import { AppIconSettingsPanel } from './AppIconSettingsPanel';
import { HapticsSettings } from './HapticsSettings';
import { LanguageSettings } from './LanguageSettings';
import { MemoryWorldSettings } from './MemoryWorldSettings';
import { MomentsLayoutSettings } from './MomentsLayoutSettings';
import { PersonColoursSettings } from './PersonColoursSettings';
import { ThemeControl } from './ThemeControl';
import { DesignPaletteSettings, WirDesignSettings } from './WirDesignSettings';
import { WirReelStyleSettings } from './WirReelStyleSettings';

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
      <PersonColoursSettings />
      <DesignPaletteSettings />
      <WirDesignSettings />
      <WirReelStyleSettings />
      <MomentsLayoutSettings />
      <MemoryWorldSettings />
      <HapticsSettings />
      <AppIconSettingsPanel />
    </div>
  );
}
