import { useTranslation } from '../i18n';
import { ThemeControl } from './ThemeControl';
import { AppIconSettingsPanel } from './AppIconSettingsPanel';

/** Appearance belongs to the centralized personal settings hierarchy. */
export function ProfileAppearancePanel({
  id = 'settings-appearance',
}: {
  id?: string;
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
      <AppIconSettingsPanel />
    </div>
  );
}
