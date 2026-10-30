import { Link } from 'react-router-dom';
import { SETTINGS_CATEGORIES } from '../client/settingsNavigation';
import { useTranslation } from '../i18n';
import './SettingsIndex.css';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import type { SettingsCategoryId } from '../client/routes';

const CATEGORY_ICONS: Record<SettingsCategoryId, EimirIconName> = {
  relationship: 'wir',
  notifications: 'benachrichtigungen',
  today: 'vibe',
  appearance: 'einstellungen',
  memories: 'momente',
  data: 'listen',
  account: 'profil',
};

export function SettingsIndex() {
  const { t } = useTranslation();

  return (
    <nav
      className="settings-index"
      aria-label={t('profileIdentity.settingsTitle')}
    >
      <ul className="settings-category-list">
        {SETTINGS_CATEGORIES.map((category) => (
          <li key={category.id}>
            <Link className="settings-category-link" to={category.path}>
              <span className="more-destination-icon" aria-hidden="true">
                <EimirIcon name={CATEGORY_ICONS[category.id]} />
              </span>
              <span className="settings-category-copy">
                <strong>{t(category.titleKey)}</strong>
                <span>{t(category.descriptionKey)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
