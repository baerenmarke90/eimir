import { type ComponentProps, useMemo } from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../client/apiConfiguration';
import type { DashboardModuleKey } from '../client/dashboardModules';
import {
  usePartnerLocationApi,
  usePartnerLocationSettings,
} from '../client/partnerLocation';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { DashboardSettingsPanel } from './DashboardSettingsPanel';
import { GAMES_COUPLE_CAPABILITY } from './GamesProductArea';

const PARTNER_DISTANCE_MODULE: readonly DashboardModuleKey[] = [
  'partner_distance',
];
// Both Wir game modules are Premium (`games.couple`).
const GAMES_MODULES: readonly DashboardModuleKey[] = [
  'games_waiting',
  'shared_garden',
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

/**
 * Settings › Wir (Product Owner 2026-11-17): the shared garden module, and
 * the waiting games module (#2158 C), are Premium (`games.couple`). Without the capability its row stays listed with
 * the Pro marker but switched off and disabled; a saved choice is kept and
 * returns with Pro. Reuses the session's single entitlement read.
 */
export function useSharedGardenModuleLocked({
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
  const load = useMemo(
    () =>
      entitlementLoader(
        new EntitlementsApi(
          new Configuration({
            basePath: apiBaseUrl,
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ),
        spaceId,
      ),
    [apiBaseUrl, accessToken, spaceId],
  );
  const games = useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: GAMES_COUPLE_CAPABILITY,
  });
  return games.data === true && !games.isError ? NONE : GAMES_MODULES;
}

/** Settings › Wir: the module panel, aware of Pro module availability. */
export function WirDashboardSettingsPanel({
  apiBaseUrl,
  accessToken,
  ...panel
}: Omit<
  ComponentProps<typeof DashboardSettingsPanel>,
  'unavailableModuleKeys' | 'lockedModuleKeys'
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
  const locked = useSharedGardenModuleLocked({
    apiBaseUrl,
    accessToken,
    accountId: panel.accountId,
    spaceId: panel.spaceId,
  });
  return (
    <DashboardSettingsPanel
      {...panel}
      unavailableModuleKeys={unavailable}
      lockedModuleKeys={locked}
    />
  );
}
