import { Link } from 'react-router-dom';
import {
  hasStoredSharing,
  isSharingActive,
  usePartnerLocationApi,
  usePartnerLocationCapability,
  usePartnerLocationSettings,
  usePartnerName,
} from '../client/partnerLocation';
import { PARTNER_LOCATION_SETTINGS_ROUTE } from '../client/routes';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { useSharingEndLabel } from './PartnerLocationControls';
import { ProMark } from './ProMark';
import './SettingsIndex.css';
import './PartnerLocation.css';

/**
 * Entry under Settings › Relationship. Hidden when unpaired or disabled by
 * the operator, but always shown while something is shared or stored, so
 * Stop stays reachable without Pro.
 */
export function PartnerLocationSettingsEntry({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const owner = { apiBaseUrl, accessToken, accountId, spaceId };
  const api = usePartnerLocationApi(owner);
  const settings = usePartnerLocationSettings({ ...owner, api }).data;
  const capability = usePartnerLocationCapability(owner);
  const { paired } = usePartnerName(owner);
  const endLabel = useSharingEndLabel();

  const visible =
    hasStoredSharing(settings) ||
    settings?.available === true ||
    (capability.data === false && paired === true);
  if (!settings || !visible) return null;

  const active = isSharingActive(settings);
  return (
    <nav
      className="partner-location-entry"
      aria-label={t('partnerLocation.settingsTitle')}
    >
      <Link
        className="settings-category-link"
        to={PARTNER_LOCATION_SETTINGS_ROUTE}
      >
        <span className="more-destination-icon" aria-hidden="true">
          <EimirIcon name="orte" />
        </span>
        <span className="settings-category-copy">
          <strong>
            {t('partnerLocation.settingsTitle')}{' '}
            <ProMark label={t('partnerLocation.pro')} />
          </strong>
          <span>
            {active
              ? settings.indefinite
                ? t('partnerLocation.statusActiveIndefinite')
                : settings.expiresAt
                  ? t('partnerLocation.statusActiveUntil', {
                      end: endLabel(settings.expiresAt),
                    })
                  : t('partnerLocation.statusActiveIndefinite')
              : t('partnerLocation.settingsEntryIntro')}
          </span>
        </span>
      </Link>
    </nav>
  );
}
