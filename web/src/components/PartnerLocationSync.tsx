import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  backgroundLocationStatus,
  clearPublicationMemory,
  publishOwnPositionIfDue,
  syncBackgroundSharing,
} from '../client/approximateLocation';
import { isClientOnline } from '../client/connectivity';
import {
  partnerLocationSettingsQueryKey,
  readPartnerLocationSettings,
  usePartnerLocationApi,
  usePartnerLocationCapability,
} from '../client/partnerLocation';

/** Resume checks closer together than this reuse the previous result. */
export const PARTNER_LOCATION_RESUME_MIN_INTERVAL_MS = 60_000;

/**
 * On app open and resume, keeps the owner's own share current: rotates or
 * stops the background credential (`syncBackgroundSharing`) and publishes one
 * approximate position when the publish rules require it. Nothing runs
 * continuously and nothing runs while sharing is off, unless this device
 * still has background updates enabled that must be stopped.
 */
export function PartnerLocationSync({
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
  const owner = { apiBaseUrl, accessToken, accountId, spaceId };
  const api = usePartnerLocationApi(owner);
  const capability = usePartnerLocationCapability(owner);
  const entitled = capability.data === true;
  const queryClient = useQueryClient();
  const lastRun = useRef(Number.NEGATIVE_INFINITY);
  const running = useRef(false);

  // Space switch and sign-out unmount this owner: forget publication state.
  useEffect(() => () => clearPublicationMemory(), []);

  useEffect(() => {
    if (!capability.isFetched) return;
    let disposed = false;
    const run = async (force: boolean) => {
      if (running.current || !isClientOnline()) return;
      const now = Date.now();
      if (
        !force &&
        now - lastRun.current < PARTNER_LOCATION_RESUME_MIN_INTERVAL_MS
      )
        return;
      running.current = true;
      lastRun.current = now;
      try {
        const background = await backgroundLocationStatus();
        if (!entitled && !background.enabled) return;
        const settings = await readPartnerLocationSettings(api, spaceId);
        if (disposed) return;
        queryClient.setQueryData(
          partnerLocationSettingsQueryKey(accountId, spaceId),
          settings,
        );
        await syncBackgroundSharing({
          api,
          spaceId,
          instance: apiBaseUrl,
          settings,
        }).catch(() => undefined);
        if (settings.state !== 'ACTIVE' || disposed) return;
        const view = await publishOwnPositionIfDue({
          api,
          spaceId,
          accountId,
          settings,
        });
        if (view && !disposed) {
          queryClient.setQueryData(
            partnerLocationSettingsQueryKey(accountId, spaceId),
            view,
          );
        }
      } catch {
        // Best effort: the next open or resume tries again.
      } finally {
        running.current = false;
      }
    };
    void run(true);
    const unsubscribe = focusManager.subscribe((focused) => {
      if (focused) void run(false);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [
    accountId,
    api,
    apiBaseUrl,
    capability.isFetched,
    entitled,
    queryClient,
    spaceId,
  ]);

  return null;
}
