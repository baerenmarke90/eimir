import { Link } from 'react-router-dom';
import { SETTINGS_CATEGORIES } from '../client/settingsNavigation';
import {
  appUpdatesAvailable,
  type AppUpdatesAdapter,
} from '../client/appUpdates';
import { useTranslation } from '../i18n';
import { AppUpdatesSummary } from './AppUpdatesSummary';
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
  updates: 'einstellungen',
};

export function SettingsIndex({
  updatesAdapter,
}: {
  updatesAdapter?: AppUpdatesAdapter;
} = {}) {
  const { t } = useTranslation();

  return (
    <nav
      className="settings-index"
      aria-label={t('profileIdentity.settingsTitle')}
    >
      <ul className="settings-category-list">
        {SETTINGS_CATEGORIES.filter(
          (category) =>
            category.id !== 'updates' ||
            Boolean(updatesAdapter) ||
            appUpdatesAvailable(),
        ).map((category) => (
          <li key={category.id}>
            <Link className="settings-category-link" to={category.path}>
              <span className="more-destination-icon" aria-hidden="true">
                <EimirIcon name={CATEGORY_ICONS[category.id]} />
              </span>
              <span className="settings-category-copy">
                <strong>{t(category.titleKey)}</strong>
                {category.id === 'updates' ? (
                  <AppUpdatesSummary adapter={updatesAdapter} />
                ) : (
                  <span>{t(category.descriptionKey)}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
