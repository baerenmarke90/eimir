import { Link } from 'react-router-dom';
import {
  type AppUpdatesAdapter,
  appUpdatesAvailable,
} from '../client/appUpdates';
import type { SettingsCategoryId } from '../client/routes';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_GROUPS,
} from '../client/settingsNavigation';
import { useTranslation } from '../i18n';
import { AppUpdatesSummary } from './AppUpdatesSummary';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ProMark } from './ProMark';
import './SettingsIndex.css';

const CATEGORY_ICONS: Record<SettingsCategoryId, EimirIconName> = {
  relationship: 'wir',
  shared: 'gemeinsam',
  notifications: 'benachrichtigungen',
  today: 'vibe',
  appearance: 'einstellungen',
  memories: 'momente',
  media: 'foto',
  calendar: 'kalender',
  data: 'listen',
  account: 'profil',
  updates: 'einstellungen',
};

/**
 * Settings grouped by whose they are (both of you, only me, connections,
 * data and account). A group is one surface with hairline separators and every
 * row carries one short line instead of a paragraph.
 */
export function SettingsIndex({
  statuses = {},
  updatesAdapter,
}: {
  /** Live one-line statuses by category; a row without one shows its summary. */
  statuses?: Partial<Record<SettingsCategoryId, string>>;
  updatesAdapter?: AppUpdatesAdapter;
}) {
  const { t } = useTranslation();
  const showUpdates = Boolean(updatesAdapter) || appUpdatesAvailable();

  return (
    <nav
      className="settings-index"
      aria-label={t('profileIdentity.settingsTitle')}
    >
      {SETTINGS_GROUPS.map((group) => {
        const categories = SETTINGS_CATEGORIES.filter(
          (category) =>
            category.group === group.id &&
            (category.id !== 'updates' || showUpdates),
        );
        if (!categories.length) return null;
        const headingId = `settings-group-${group.id}`;
        return (
          <section
            key={group.id}
            className="settings-group"
            aria-labelledby={headingId}
          >
            <h2 id={headingId} className="settings-group-title">
              {t(group.titleKey)}
            </h2>
            <ul className="settings-category-list">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link className="settings-category-link" to={category.path}>
                    <span className="more-destination-icon" aria-hidden="true">
                      <EimirIcon name={CATEGORY_ICONS[category.id]} />
                    </span>
                    <span className="settings-category-copy">
                      <strong>
                        {t(category.titleKey)}
                        {category.proKey ? (
                          <>
                            {' '}
                            <ProMark label={t(category.proKey)} />
                          </>
                        ) : null}
                      </strong>
                      {category.id === 'updates' ? (
                        <AppUpdatesSummary adapter={updatesAdapter} />
                      ) : (
                        <span>
                          {statuses[category.id] ?? t(category.summaryKey)}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
