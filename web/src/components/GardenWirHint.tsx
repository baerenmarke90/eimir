import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DashboardApi } from '../api/generated/apis/DashboardApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import type { DashboardModulePreferenceView } from '../api/generated/models/DashboardModulePreferenceView';
import type { SpaceEntitlementView } from '../api/generated/models/SpaceEntitlementView';
import { Configuration } from '../client/apiConfiguration';
import {
  dashboardPreferencesQueryKey,
  isDashboardModuleVisible,
} from '../client/dashboardPreferences';
import { normalizeClientError } from '../client/problemDetails';
import {
  quietHintRetired,
  restoreQuietHint,
  useQuietHint,
} from '../client/quietHints';
import { appRoutePath } from '../client/routes';
import {
  entitlementLoader,
  useSpaceCapability,
} from '../client/spaceEntitlement';
import { useTranslation } from '../i18n';
import { GAMES_COUPLE_CAPABILITY } from './GamesProductArea';
import { QuietHint } from './QuietHint';

/** Device-local quiet-hint id; retired once shown, dismissed or accepted. */
export const GARDEN_WIR_HINT_ID = 'gardenOnWir';
/** Active (visible) time in the garden before the hint may appear. */
export const GARDEN_WIR_HINT_ACTIVE_MS = 20_000;
/** A moment settles (status, reaction, sparkle) before the offer appears. */
export const GARDEN_WIR_HINT_SETTLE_MS = 1_500;
const TICK_MS = 1_000;
const MODULE_KEY = 'shared_garden';

export interface GardenWirHintServices {
  loadEntitlement: () => Promise<SpaceEntitlementView>;
  loadPreferences: () => Promise<DashboardModulePreferenceList>;
  showOnWir: () => Promise<DashboardModulePreferenceView>;
}

function useDefaultServices(
  apiBaseUrl: string,
  accessToken: string,
  spaceId: string,
): GardenWirHintServices {
  return useMemo(() => {
    const configuration = new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const dashboard = new DashboardApi(configuration);
    return {
      loadEntitlement: entitlementLoader(
        new EntitlementsApi(configuration),
        spaceId,
      ),
      loadPreferences: () =>
        dashboard.listDashboardModulePreferences({ spaceId }),
      // The same preference write as the Wir settings switch.
      showOnWir: () =>
        dashboard.updateDashboardModulePreference({
          spaceId,
          moduleKey: MODULE_KEY,
          dashboardModulePreferenceUpdate: { visible: true },
        }),
    };
  }, [apiBaseUrl, accessToken, spaceId]);
}

/** Counts time while the page is visible; stops once `limit` is reached. */
function useActiveTime(limit: number, enabled: boolean): boolean {
  const [elapsed, setElapsed] = useState(0);
  const reached = elapsed >= limit;
  useEffect(() => {
    if (!enabled || reached) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setElapsed((value) => value + TICK_MS);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled, reached]);
  return reached;
}

type Phase = 'waiting' | 'offered' | 'saving' | 'failed' | 'done' | 'closed';

/**
 * A one-time, gentle offer inside the garden to show it on Wir too (Product
 * Owner 2026-11-17). It uses the quiet-hint store (device-local, per account
 * and Space) and appears at most once: after the first successful garden
 * moment of a visit (`moment` > 0) or about 20 s of active time, never while
 * something else is running (`quiet`), only with `games.couple` and only
 * while the module is not on Wir. Accepting writes the ordinary Wir
 * preference, the person's own explicit choice. Free never sees it.
 */
export function GardenWirHint({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  moment,
  quiet,
  services,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  /** Increases with each successful garden action in this visit. */
  moment: number;
  /** A sheet, dialog, flight or reaction is running. */
  quiet: boolean;
  services?: GardenWirHintServices;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const defaults = useDefaultServices(apiBaseUrl, accessToken, spaceId);
  const api = services ?? defaults;
  const [phase, setPhase] = useState<Phase>('waiting');
  // Nothing is read once the hint has retired on this device.
  const [retired] = useState(() =>
    quietHintRetired(accountId, spaceId, GARDEN_WIR_HINT_ID),
  );
  const games = useSpaceCapability({
    accountId,
    spaceId,
    load: api.loadEntitlement,
    enabled: !retired,
    capability: GAMES_COUPLE_CAPABILITY,
  });
  const allowed = !retired && games.data === true && !games.isError;
  const preferencesKey = dashboardPreferencesQueryKey(accountId, spaceId);
  const preferences = useQuery({
    queryKey: preferencesKey,
    queryFn: async () => {
      try {
        return await api.loadPreferences();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: allowed,
    retry: false,
  });
  const onWir =
    preferences.data !== undefined &&
    isDashboardModuleVisible(preferences.data, MODULE_KEY);
  const [settledMoment, setSettledMoment] = useState(0);
  useEffect(() => {
    if (moment === 0) return;
    const timer = window.setTimeout(
      () => setSettledMoment(moment),
      GARDEN_WIR_HINT_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [moment]);
  const timeReached = useActiveTime(
    GARDEN_WIR_HINT_ACTIVE_MS,
    allowed && phase === 'waiting',
  );
  const ready =
    allowed &&
    preferences.data !== undefined &&
    !onWir &&
    (settledMoment > 0 || timeReached) &&
    !quiet;
  const hint = useQuietHint(accountId, spaceId, [
    {
      id: GARDEN_WIR_HINT_ID,
      eligible: ready && phase === 'waiting',
      used: onWir && phase === 'waiting',
    },
  ]);
  const { activeId, dismiss } = hint;
  // Shown once: it retires as it appears and stays for this visit.
  useEffect(() => {
    if (activeId !== GARDEN_WIR_HINT_ID || phase !== 'waiting') return;
    setPhase('offered');
    dismiss();
  }, [activeId, dismiss, phase]);

  async function accept() {
    setPhase('saving');
    try {
      const saved = await api.showOnWir();
      queryClient.setQueryData<DashboardModulePreferenceList>(
        preferencesKey,
        (current) => ({
          items: [
            ...(current?.items ?? []).filter(
              (item) => item.moduleKey !== MODULE_KEY,
            ),
            { ...saved, moduleKey: MODULE_KEY, visible: true },
          ],
        }),
      );
      setPhase('done');
    } catch {
      // Keep the offer for a retry now and on a later visit.
      restoreQuietHint(accountId, spaceId, GARDEN_WIR_HINT_ID);
      setPhase('failed');
    }
  }

  const close = () => setPhase('closed');

  if (phase === 'waiting' || phase === 'closed') return null;
  const message =
    phase === 'done'
      ? t('games.garden.wirHint.done')
      : phase === 'failed'
        ? t('games.garden.wirHint.failed')
        : t('games.garden.wirHint.text');
  return (
    <div className="garden-wir-hint">
      {/* Announced politely; focus stays where the person is. */}
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {phase === 'done' ? (
        <QuietHint
          key="done"
          action={{
            to: appRoutePath('today'),
            label: t('games.garden.wirHint.toWir'),
          }}
          onDismiss={close}
        >
          {message}
        </QuietHint>
      ) : (
        <QuietHint
          key="offer"
          tone="new"
          action={{
            label:
              phase === 'saving'
                ? t('games.garden.wirHint.saving')
                : t('games.garden.wirHint.accept'),
            onClick: () => void accept(),
            disabled: phase === 'saving',
          }}
          dismissLabel={t('games.garden.wirHint.later')}
          onDismiss={close}
        >
          {message}
        </QuietHint>
      )}
    </div>
  );
}
