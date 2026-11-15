import { Link } from 'react-router-dom';
import { useSessionSpaceEntitlement } from '../client/proPresentation';
import { proPaywallPath } from '../client/routes';
import { useTranslation } from '../i18n';
import './SettingsIndex.css';
import { EimirIcon } from './EimirIcon';

/**
 * One way into the Pro page from the account settings (#1907 D1). Features, prices,
 * purchase and subscription management live on the Pro page only; the row
 * reads the session's existing entitlement without an extra request.
 */
export function ProSettingsRow() {
  const { t } = useTranslation();
  const { query } = useSessionSpaceEntitlement();
  const active = query.data?.tier === 'PREMIUM';
  return (
    // Keeps the legacy `#eimir-pro` anchor (old profile links) working.
    <nav
      id="eimir-pro"
      className="settings-index"
      aria-label={t('profiles.premium.title')}
    >
      <ul className="settings-category-list">
        <li>
          <Link className="settings-category-link" to={proPaywallPath()}>
            <span className="more-destination-icon" aria-hidden="true">
              <EimirIcon name="pro" variant="duotone" />
            </span>
            <span className="settings-category-copy">
              <strong>{t('profiles.premium.title')}</strong>
              <span>
                {t(
                  active
                    ? 'profiles.premium.rowActive'
                    : 'profiles.premium.rowInactive',
                )}
              </span>
            </span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
