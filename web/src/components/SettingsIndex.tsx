import { Link } from 'react-router-dom';
import { SETTINGS_CATEGORIES } from '../client/settingsNavigation';
import { useTranslation } from '../i18n';
import './SettingsIndex.css';

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
              <span className="settings-category-copy">
                <strong>{t(category.titleKey)}</strong>
                <span>{t(category.descriptionKey)}</span>
              </span>
              <span className="settings-category-chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
