import { usePartnerDistanceOnWir } from '../client/partnerDistance';
import {
  usePartnerLocationApi,
  usePartnerLocationSettings,
} from '../client/partnerLocation';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ProMark } from './ProMark';
import './PartnerLocation.css';

/**
 * Settings › Wir: the viewer's own "show distance on Wir" preference (#1792).
 * It hides the hero signal for this viewer only and never touches anyone's
 * sharing. Shown only where partner distance is available at all.
 */
export function PartnerDistanceWirSetting({
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
  const preference = usePartnerDistanceOnWir({
    instance: apiBaseUrl,
    accountId,
    spaceId,
  });
  if (settings?.available !== true) return null;
  return (
    <div className="dashboard-module-option is-hidden partner-distance-wir-option">
      <span className="dashboard-module-icon" aria-hidden="true">
        <EimirIcon name="orte" />
      </span>
      <label
        className="dashboard-module-option-label partner-distance-wir-label"
        htmlFor="partner-distance-on-wir"
      >
        <span>
          {t('partnerLocation.wirToggleLabel')}{' '}
          <ProMark label={t('partnerLocation.pro')} />
        </span>
        <span
          id="partner-distance-on-wir-hint"
          className="partner-distance-wir-hint"
        >
          {t('partnerLocation.wirToggleHint')}
        </span>
      </label>
      <label className="dashboard-module-switch">
        <input
          id="partner-distance-on-wir"
          type="checkbox"
          aria-label={t('partnerLocation.wirToggleLabel')}
          aria-describedby="partner-distance-on-wir-hint"
          checked={preference.shown}
          onChange={(event) => preference.setShown(event.target.checked)}
        />
      </label>
    </div>
  );
}
