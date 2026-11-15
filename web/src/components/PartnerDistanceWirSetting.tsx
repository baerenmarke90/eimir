import type { ComponentProps } from 'react';
import type { DashboardModuleKey } from '../client/dashboardModules';
import {
  usePartnerLocationApi,
  usePartnerLocationSettings,
} from '../client/partnerLocation';
import { DashboardSettingsPanel } from './DashboardSettingsPanel';

const PARTNER_DISTANCE_MODULE: readonly DashboardModuleKey[] = [
  'partner_distance',
];
const NONE: readonly DashboardModuleKey[] = [];

/**
 * Settings › Wir (#1792): the `partner_distance` module
 * (`partnerLocation.wirModuleLabel`) is shown,
 * hidden and moved like every other Wir module. It is listed only where
 * partner distance is available at all (Premium, paired, enabled on this
 * deployment); otherwise it stays out of the list without a reason.
 */
export function usePartnerDistanceModuleUnavailable({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}): readonly DashboardModuleKey[] {
  const owner = { apiBaseUrl, accessToken, accountId, spaceId };
  const api = usePartnerLocationApi(owner);
  const settings = usePartnerLocationSettings({ ...owner, api }).data;
  return settings?.available === true ? NONE : PARTNER_DISTANCE_MODULE;
}

/** Settings › Wir: the module panel, aware of partner-distance availability. */
export function WirDashboardSettingsPanel({
  apiBaseUrl,
  accessToken,
  ...panel
}: Omit<
  ComponentProps<typeof DashboardSettingsPanel>,
  'unavailableModuleKeys'
> & {
  apiBaseUrl: string;
  accessToken: string;
}) {
  const unavailable = usePartnerDistanceModuleUnavailable({
    apiBaseUrl,
    accessToken,
    accountId: panel.accountId,
    spaceId: panel.spaceId,
  });
  return (
    <DashboardSettingsPanel {...panel} unavailableModuleKeys={unavailable} />
  );
}
